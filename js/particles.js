/**
 * Particle system  orbiting bodies around the black hole.
 *
 * Depth-correct rendering:
 *   Pass 1   physics + far-side pixels  (world y < cy -> behind BH shadow)
 *   Stamp    BH void + warm halo + photon ring written into pixel buffer
 *   Pass 2   near-side pixels           (world y >= cy -> in front of BH)
 *   Single putImageData  one GPU upload per frame
 *
 * Globals consumed: CONFIG, W, H, bhX(), bhY(), heroMX, heroMY, ctx
 */

const MAX_N = 100000;
let N = CONFIG.PARTICLE_COUNT; // live count, mutated by adaptive logic in main.js

const px = new Float32Array(MAX_N);
const py   = new Float32Array(MAX_N);
const pvx = new Float32Array(MAX_N);
const pvy = new Float32Array(MAX_N);
const plife = new Float32Array(MAX_N);
const pmaxlife = new Float32Array(MAX_N);
const ptype = new Uint8Array(MAX_N);  // 0=teal  1=amber  2=dim-white

// Pre-allocated pixel buffer  no per-frame createImageData allocation
let _imgData = null;
let _pxBuf = null;

function _ensureBuf() {
  if (!_imgData || _imgData.width !== W || _imgData.height !== H) {
    _imgData = ctx.createImageData(W, H);
    _pxBuf   = _imgData.data;
  }
}

let _hudPull = null;

// Metrics read by hud.js every frame
const hudMetrics = {
  innerCount: 0,     // particles within 3× SINGULARITY_R
  avgVelocity: 0,     // mean particle speed (px/frame)
  meanOrbit: 0,     // mean distance from BH (px)
  consumedSec: 0,     // particles absorbed in the last second
  particleCount: N,     // live count, kept in sync with N
};
let _consumedAccum = 0;
let _secTimer      = 0;

function spawnParticle(i) {
  const angle = Math.random() * Math.PI * 2;
  const minDist = CONFIG.SINGULARITY_R + CONFIG.PARTICLE_MIN_OFFSET;
  const maxDist = Math.min(W, H) * CONFIG.DISC_OUTER_R_FACTOR;
  const dist = minDist + Math.random() * (maxDist - minDist);

  px[i] = bhX() + Math.cos(angle) * dist;
  py[i] = bhY() + Math.sin(angle) * dist;

  const vCirc = Math.sqrt(CONFIG.GM / dist);
  const ecc = CONFIG.PARTICLE_ECC_MIN + Math.random() * CONFIG.PARTICLE_ECC_SPREAD;
  pvx[i] = -Math.sin(angle) * vCirc * ecc;
  pvy[i] = Math.cos(angle) * vCirc * ecc;

  plife[i] = 0;
  pmaxlife[i] = CONFIG.PARTICLE_LIFE_MIN + Math.random() * CONFIG.PARTICLE_LIFE_MAX;
  ptype[i] = Math.random() > (1 - CONFIG.PARTICLE_NONZERO_CHANCE)
    ? (Math.random() > 0.5 ? 1 : 2)
    : 0;
}

function initParticles() {
  _hudPull = document.getElementById('h-pull');
  for (let i = 0; i < N; i++) {
    spawnParticle(i);
    plife[i] = Math.random() * pmaxlife[i];
  }
}

// Called every frame by main.js  smoothly steps N toward targetN by stepSize
function rampParticleCount(targetN, stepSize) {
  if (N === targetN) return;
  if (N < targetN) {
    const newN = Math.min(targetN, N + stepSize);
    for (let i = N; i < newN; i++) {
      spawnParticle(i);
      plife[i] = Math.random() * pmaxlife[i];
    }
    N = newN;
  } else {
    N = Math.max(targetN, N - stepSize);
  }
  hudMetrics.particleCount = N;
}

//  BH stamp  writes void + glow directly into the pixel buffer 
// Called between far-side and near-side render passes so near particles overdraw it.
function _stampBH(d, cx, cy, Wd, Hd) {
  const Rs = CONFIG.SINGULARITY_R;
  const RsSq = Rs * Rs;
  const ringR = Rs * 2.6;       // photon ring (Schwarzschild: ~2.6 Rs observable)
  const haloR = Rs * 3.5;
  const haloRSq = haloR * haloR;
  const invHalo = 1 / (haloR - Rs);

  const bx0 = Math.max(0, (cx - haloR) | 0);
  const bx1 = Math.min(Wd - 1, (cx + haloR + 1) | 0);
  const by0 = Math.max(0, (cy - haloR) | 0);
  const by1 = Math.min(Hd - 1, (cy + haloR + 1) | 0);

  for (let by = by0; by <= by1; by++) {
    const dyB = by - cy;
    const dy2 = dyB * dyB;
    const row = by * Wd;
    for (let bx = bx0; bx <= bx1; bx++) {
      const dxB = bx - cx;
      const r2  = dxB * dxB + dy2;
      if (r2 > haloRSq) continue;

      const idx = (row + bx) << 2;

      if (r2 <= RsSq) {
        // Event horizon  solid opaque void
        d[idx] = 0;
        d[idx+1] = 0;
        d[idx+2] = 0;
        d[idx+3] = 255;
      } else {
        const r = Math.sqrt(r2);
        const t = (1 - (r - Rs) * invHalo);   // 1 at edge of void -> 0 at haloR
        const t2 = t * t;

        // Warm amber heat halo
        d[idx] += (t2 * 55) | 0;
        d[idx+1] += (t2 * 22) | 0;
        d[idx+3] += (t2 * 45) | 0;

        // Photon ring  disabled
        // const rdiff = Math.abs(r - ringR);
        // if (rdiff < Rs * 0.55) {
        //   const rt    = 1 - rdiff / (Rs * 0.55);
        //   const spike = (rt * rt * 90) | 0;
        //   d[idx]   += spike;
        //   d[idx+1] += (spike * 0.65) | 0;
        //   d[idx+2] += (spike * 0.15) | 0;
        //   d[idx+3] += (spike * 0.85) | 0;
        // }
      }
    }
  }
}

//  Single-pass physics + depth-split render 
function stepParticles(dt) {
  _ensureBuf();
  _pxBuf.fill(0);

  const cx = bhX(), cy = bhY();

  const GM = CONFIG.GM;
  const GSOFT_SQ  = CONFIG.GSOFT * CONFIG.GSOFT;
  const DAMPING= CONFIG.PARTICLE_DAMPING;
  const SING_R = CONFIG.SINGULARITY_R;
  const ABS_R  = SING_R * 0.82;
  const ATT_R = CONFIG.ATTRACTION_R;
  const ATT_R_SQ = ATT_R * ATT_R;
  const CF       = CONFIG.CURSOR_FORCE;
  const DISC_T   = CONFIG.DISC_TILT;
  const DISC_T_SQ  = DISC_T * DISC_T;
  const MARGIN = 80;
  const Wd = W;
  const Hd = H;
  const proxR2 = (Hd * 0.35) * (Hd * 0.35);
  const invProxR2 = 1 / proxR2;

  const cursorWorldX = heroMX * Wd;
  const cursorWorldY = heroMY * Hd;
  const cursorActive = heroMY < 1.0 && heroMX > 0 && heroMX < 1;
  let pulling = 0;

  const d = _pxBuf;

  //  Pass 1: physics + FAR-side render (world y < cy -> behind BH) 
  for (let i = 0; i < N; i++) {
    plife[i] += dt;
    if (plife[i] > pmaxlife[i]) { spawnParticle(i); continue; }

    let x = px[i], y = py[i];
    const dx = cx - x, dy = cy - y;
    const dist2    = dx * dx + dy * dy;
    const distToBH = Math.sqrt(dist2) || 0.001;

    if (distToBH < ABS_R) { spawnParticle(i); _consumedAccum++; continue; }

    const invD = 1 / distToBH;
    const gMag = GM / (dist2 + GSOFT_SQ);
    pvx[i] += dx * invD * gMag * dt;
    pvy[i] += dy * invD * gMag * dt;
    pvx[i] *= DAMPING;
    pvy[i] *= DAMPING;

    if (cursorActive) {
      const cdx = cursorWorldX - x, cdy = cursorWorldY - y;
      const cdist2 = cdx * cdx + cdy * cdy;
      if (cdist2 < ATT_R_SQ) {
        const cdist = Math.sqrt(cdist2) || 0.001;
        const falloff = 1 - cdist / ATT_R;
        const invCd = 1 / cdist;
        pvx[i] += cdx * invCd * falloff * falloff * CF * dt;
        pvy[i] += cdy * invCd * falloff * falloff * CF * dt;
        pulling++;
      }
    }

    x = px[i] += pvx[i];
    y = py[i] += pvy[i];

    if (x < -MARGIN || x > Wd + MARGIN || y < -MARGIN || y > Hd + MARGIN) {
      spawnParticle(i); continue;
    }

    if (y >= cy) continue;   // near-side  deferred to Pass 2

    const sx = (x + 0.5) | 0;
    const sy = (cy + (y - cy) * DISC_T + 0.5) | 0;
    if (sx < 0 || sx >= Wd || sy < 0 || sy >= Hd) continue;

    const lifeRatio = plife[i] / pmaxlife[i];
    let alpha = lifeRatio < 0.12
      ? lifeRatio / 0.12
      : lifeRatio > 0.82
        ? (1 - lifeRatio) / 0.18
        : 1;

    const screenDist2 = dx * dx + DISC_T_SQ * dy * dy;
    const proximity   = 1 - screenDist2 * invProxR2;
    if (proximity > 0) {
      alpha *= 0.55 + proximity * 0.7;
      if (alpha > 1) alpha = 1;
    } else {
      alpha *= 0.55;
    }

    const base = (sy * Wd + sx) << 2;
    const intens = (alpha * 220) | 0;

    if (ptype[i] === 0) {
      d[base] += 20;
      d[base+1] += intens;
      d[base+2] += (intens * 0.65) | 0;
      d[base+3] += (intens * 0.9)  | 0;
    } else if (ptype[i] === 1) {
      d[base] += intens;
      d[base+1] += (intens * 0.48) | 0;
      d[base+2] += 10;
      d[base+3] += (intens * 0.75) | 0;
    } else {
      const v = (intens * 0.5) | 0;
      d[base] += v;
      d[base+1] += v;
      d[base+2] += v;
      d[base+3] += (intens * 0.35) | 0;
    }
  }

  //  Stamp BH shadow + halo into buffer 
  _stampBH(d, cx, cy, Wd, Hd);

  //  Pass 2: NEAR-side render (world y >= cy -> in front of BH) 
  for (let i = 0; i < N; i++) {
    const y = py[i];
    if (y < cy) continue;   // far-side already rendered

    const x = px[i];
    if (x < -MARGIN || x > Wd + MARGIN || y < -MARGIN || y > Hd + MARGIN) continue;

    const sx = (x + 0.5) | 0;
    const sy = (cy + (y - cy) * DISC_T + 0.5) | 0;
    if (sx < 0 || sx >= Wd || sy < 0 || sy >= Hd) continue;

    const lifeRatio = plife[i] / pmaxlife[i];
    let alpha = lifeRatio < 0.12
      ? lifeRatio / 0.12
      : lifeRatio > 0.82
        ? (1 - lifeRatio) / 0.18
        : 1;

    const dx2 = cx - x, dy2 = cy - y;
    const screenDist2 = dx2 * dx2 + DISC_T_SQ * dy2 * dy2;
    const proximity   = 1 - screenDist2 * invProxR2;
    if (proximity > 0) {
      alpha *= 0.55 + proximity * 0.7;
      if (alpha > 1) alpha = 1;
    } else {
      alpha *= 0.55;
    }

    const base   = (sy * Wd + sx) << 2;
    const intens = (alpha * 220) | 0;

    if (ptype[i] === 0) {
      d[base] += 20;
      d[base+1] += intens;
      d[base+2] += (intens * 0.65) | 0;
      d[base+3] += (intens * 0.9)  | 0;
    } else if (ptype[i] === 1) {
      d[base] += intens;
      d[base+1] += (intens * 0.48) | 0;
      d[base+2] += 10;
      d[base+3] += (intens * 0.75) | 0;
    } else {
      const v = (intens * 0.5) | 0;
      d[base] += v;
      d[base+1] += v;
      d[base+2] += v;
      d[base+3] += (intens * 0.35) | 0;
    }
  }

  ctx.putImageData(_imgData, 0, 0);
  _hudPull.textContent = pulling > 0 ? `CAPTURING (${pulling})` : 'IDLE';

  // Metrics update  runs every 30 frames, touches every 64th particle only
  _secTimer++;
  if (_secTimer >= 30) {
    _secTimer = 0;
    hudMetrics.consumedSec    = _consumedAccum;
    hudMetrics.particleCount  = N;
    _consumedAccum = 0;

    const mcx = bhX(), mcy = bhY();
    const innerThresh = CONFIG.SINGULARITY_R * 3;
    let vSum = 0, oSum = 0, iCount = 0, n = 0;
    for (let i = 0; i < N; i += 64) {
      const ddx = px[i] - mcx, ddy = py[i] - mcy;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      vSum += Math.sqrt(pvx[i] * pvx[i] + pvy[i] * pvy[i]);
      oSum += dist;
      if (dist < innerThresh) iCount++;
      n++;
    }
    if (n > 0) {
      hudMetrics.avgVelocity = vSum / n;
      hudMetrics.meanOrbit = oSum / n;
      hudMetrics.innerCount = iCount * 64;
    }
  }
}
