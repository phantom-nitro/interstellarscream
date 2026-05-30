(function () {
  'use strict';

  //  2D canvas  rocket line art 
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9000';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');

  let W, H;
  function resize() { W = cv.width = window.innerWidth; H = cv.height = window.innerHeight; }
  window.addEventListener('resize', resize);
  resize();

  //  Geometry 
  const BW = 30, BH = 96;
  const hw = BW / 2, hh = BH / 2;
  const NOZZLE_DY = hh * 0.60;   // 28.8  screen-Y offset from rocket centre to nozzle exit

  const footer  = document.querySelector('footer');
  const footerH = footer ? footer.offsetHeight : 48;
  const PAD_R   = 44;
  const PAD_B   = footerH + Math.round(NOZZLE_DY) + 2;

  function idleX() { return W - PAD_R; }
  function idleY() { return H - PAD_B; }

  //  State 
  let phase = 'idle', rx, ry, vy = 0, igT = 0, lnT = 0, rA = 0, visible = false;

  const GRAV = 500, THRUST_INIT = 507, THRUST_FULL = 600, THRUST_RAMP = 18.0;

  function checkScroll() {
    if (!footer) { visible = true; return; }
    const r = footer.getBoundingClientRect();
    visible = r.top < window.innerHeight && r.bottom > 0;
  }
  window.addEventListener('scroll', checkScroll, { passive: true });

  const flareCV = document.createElement('canvas');
  flareCV.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:8999;mix-blend-mode:screen';
  document.body.appendChild(flareCV);

  let _gl = null, _glProg = null, _glVao = null, _glTex = null, _glU = null;
  let _flareReady = false, _flareT0 = 0;

  const _VS = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

  const _FS = `#version 300 es
precision highp float;

uniform vec2  resolution;
uniform float time;
uniform sampler2D noiseTex;
uniform vec2  flarePosition;
uniform float intensity;
uniform float flickerSpeed;
uniform float flickerAmount;
uniform float trailLength;
uniform float trailSpread;
uniform float trailWidth;
uniform float particleCount;
uniform float colorShift;
uniform float noiseStrength;

out vec4 outColor;

void main() {
  vec2 emitter = vec2(flarePosition.x, 1.0 - flarePosition.y) * resolution;
  vec2 p = (gl_FragCoord.xy - emitter) / resolution.y;

  vec4 channelScale = vec4(1.0, 2.0, 3.0, 0.0);
  float ph = flickerSpeed * time + p.x * 0.25;
  vec4 light = vec4(0.0);

  for (float particle = 0.0; particle < 50.0; particle += 1.0) {
    if (particle >= particleCount) break;

    vec4 wave  = sin(particle) * channelScale;
    vec4 hue   = cos(wave + colorShift) + 1.0;
    float pulse = intensity * exp(flickerAmount * sin(particle + particle * ph));

    vec2  noiseUv   = p / exp(wave.x) + vec2(particle, time * flickerSpeed) / 8.0;
    float noiseValue = texture(noiseTex, fract(noiseUv)).r * 40.0 * noiseStrength;
    noiseValue = max(noiseValue, 0.01);

    vec2  shaped  = max(p, p / vec2(trailWidth, noiseValue));
    float falloff = 1.0 / (length(shaped) * 10000.0);

    light += hue * pulse * falloff;
    p.y += trailLength  * 0.02;
    p.x += trailSpread  * 0.015 * cos(particle * (channelScale.z + 8.0 + particle) + 2.0 * ph);
  }

  outColor = vec4(tanh((light * light).rgb), 1.0);
}`;

  (function _initGL() {
    try {
      const gl = flareCV.getContext('webgl2', { antialias: false, depth: false, stencil: false });
      if (!gl) return;

      function compile(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(s));
        return s;
      }

      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, _VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, _FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(prog));

      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER,
        new Float32Array([-1,-1, 1,-1, -1,1, 1,-1, 1,1, -1,1]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog, 'position');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      const SIZE = 256;
      let s4 = 4200;
      const rand = () => { s4 = (1664525 * s4 + 1013904223) >>> 0; return s4 / 4294967296; };
      let src = new Float32Array(SIZE * SIZE), dst = new Float32Array(SIZE * SIZE);
      for (let i = 0; i < src.length; i++) src[i] = rand();
      for (let pass = 0; pass < 7; pass++) {
        for (let y = 0; y < SIZE; y++) {
          const y0 = ((y-1+SIZE) % SIZE) * SIZE, y1 = y * SIZE, y2 = ((y+1) % SIZE) * SIZE;
          for (let x = 0; x < SIZE; x++) {
            const x0 = (x-1+SIZE) % SIZE, x2 = (x+1) % SIZE;
            dst[y1+x] = (src[y1+x]*4 +
              (src[y1+x0]+src[y1+x2]+src[y0+x]+src[y2+x])*2 +
               src[y0+x0]+src[y0+x2]+src[y2+x0]+src[y2+x2]) / 16;
          }
        }
        [src, dst] = [dst, src];
      }
      const rgba = new Uint8Array(SIZE * SIZE * 4);
      for (let i = 0; i < src.length; i++) {
        const x = i % SIZE, y = Math.floor(i / SIZE);
        const bands = 0.5 + 0.5 * Math.sin(x * 0.09 + y * 0.035);
        const v = Math.max(0, Math.min(255, Math.round((src[i]*0.72 + bands*0.28) * 255)));
        rgba[i*4] = rgba[i*4+1] = rgba[i*4+2] = v;
        rgba[i*4+3] = 255;
      }

      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SIZE, SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);

      _glU = Object.fromEntries(
        ['resolution','time','noiseTex','flarePosition','intensity','flickerSpeed',
         'flickerAmount','trailLength','trailSpread','trailWidth','particleCount',
         'colorShift','noiseStrength'].map(n => [n, gl.getUniformLocation(prog, n)])
      );

      _gl = gl; _glProg = prog; _glVao = vao; _glTex = tex;
      _flareReady = true;
      _flareT0 = performance.now();
    } catch (e) {
      console.warn('Rocket flare GL init:', e);
    }
  })();

  function _syncFlareSize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const fw = Math.max(1, Math.floor(flareCV.clientWidth  * dpr));
    const fh = Math.max(1, Math.floor(flareCV.clientHeight * dpr));
    if (flareCV.width !== fw || flareCV.height !== fh) {
      flareCV.width = fw; flareCV.height = fh;
      _gl.viewport(0, 0, fw, fh);
    }
  }

  function _renderFlare(emitX, emitY, inten) {
    if (!_flareReady) return;
    _syncFlareSize();
    _gl.clearColor(0, 0, 0, 1); _gl.clear(_gl.COLOR_BUFFER_BIT);
    if (inten <= 0) return;

    const t = (performance.now() - _flareT0) / 1000;
    const g = _gl, u = _glU;

    g.useProgram(_glProg);
    g.bindVertexArray(_glVao);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, _glTex);

    g.uniform2f(u.resolution,    flareCV.width, flareCV.height);
    g.uniform1f(u.time,          t);
    g.uniform1i(u.noiseTex,      0);
    g.uniform2f(u.flarePosition, emitX / W, emitY / H);
    g.uniform1f(u.intensity,     inten * 8.0);
    g.uniform1f(u.flickerSpeed,  1.75);
    g.uniform1f(u.flickerAmount, 0.30);
    g.uniform1f(u.trailLength,   0.10);
    g.uniform1f(u.trailSpread,   0.15);
    g.uniform1f(u.trailWidth,    0.50);
    g.uniform1f(u.particleCount, 18.0);
    g.uniform1f(u.colorShift,    4.20);
    g.uniform1f(u.noiseStrength, 1.0);

    g.drawArrays(g.TRIANGLES, 0, 6);
  }

  function _clearFlare() {
    if (!_flareReady) return;
    _syncFlareSize();
    _gl.clearColor(0, 0, 0, 1); _gl.clear(_gl.COLOR_BUFFER_BIT);
  }

  //  Detailed line-art rocket 
  function drawRocket(x, y, shake) {
    const jx = shake ? (Math.random() - 0.5) * shake : 0;
    const jy = shake ? (Math.random() - 0.5) * shake * 0.5 : 0;

    ctx.save();
    ctx.translate(x + jx, y + jy);
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    const firing = phase === 'launch' || phase === 'ignite';
    const bodyA  = firing ? 0.95 : 0.72;
    const dimA = firing ? 0.38 : 0.18;
    const tealA  = firing ? 0.80 : 0.40;
    const bodyCol  = `rgba(232,226,212,${bodyA})`;
    const dimCol = `rgba(232,226,212,${dimA})`;
    const tealCol  = `rgba(126,207,179,${tealA})`;
    const tealDim  = `rgba(126,207,179,${tealA * 0.50})`;

    const noseH = -hh;
    const bodyTop = -hh * 0.28;
    const bodyBot =  hh * 0.38;
    const bellExt =  hh * 0.60;
    const bodyH = bodyBot - bodyTop;
    const sep1  = bodyTop + bodyH * 0.36;
    const sep2  = bodyTop + bodyH * 0.70;
    const porthY = bodyTop + bodyH * 0.17;

    // Ogive nose  bezier preserves vertical tangent at shoulder
    const cpY1 = bodyTop - (bodyTop - noseH) * 0.52;
    ctx.strokeStyle = bodyCol;
    ctx.lineWidth   = 1.6;
    ctx.beginPath();
    ctx.moveTo(-hw, bodyTop);
    ctx.bezierCurveTo(-hw, cpY1, -hw * 0.20, noseH, 0, noseH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo( hw, bodyTop);
    ctx.bezierCurveTo( hw, cpY1,  hw * 0.20, noseH, 0, noseH);
    ctx.stroke();

    // Antenna  mast + beacon ball (teal in idle, dim when firing)
    ctx.strokeStyle = dimCol;
    ctx.lineWidth   = 0.9;
    ctx.beginPath(); ctx.moveTo(0, noseH); ctx.lineTo(0, noseH - 7); ctx.stroke();
    ctx.strokeStyle = phase === 'idle' ? tealCol : dimCol;
    ctx.beginPath(); ctx.arc(0, noseH - 8.5, 1.5, 0, Math.PI * 2); ctx.stroke();

    // Pulsing ping ring  only when idle (signals interactivity)
    if (phase === 'idle') {
      const frac = (performance.now() / 2500) % 1;
      ctx.strokeStyle = `rgba(126,207,179,${(1 - frac) * 0.55})`;
      ctx.lineWidth   = 0.7;
      ctx.beginPath();
      ctx.arc(0, noseH - 8.5, 2.5 + frac * 9, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Body tube
    ctx.strokeStyle = bodyCol;
    ctx.lineWidth   = 1.6;
    ctx.strokeRect(-hw, bodyTop, BW, bodyH);

    // Panel lines
    ctx.strokeStyle = dimCol;
    ctx.lineWidth   = 0.75;
    ctx.beginPath(); ctx.moveTo(-hw, sep1); ctx.lineTo(hw, sep1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-hw, sep2); ctx.lineTo(hw, sep2); ctx.stroke();
    ctx.lineWidth = 0.45;
    ctx.beginPath(); ctx.moveTo(0, bodyTop + 1); ctx.lineTo(0, bodyBot - 1); ctx.stroke();

    // Porthole  double ring + crosshair
    const pR1 = 5.5, pR2 = 3.5;
    ctx.strokeStyle = tealCol;
    ctx.lineWidth   = 1.4;
    ctx.beginPath(); ctx.arc(0, porthY, pR1, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth   = 0.9;
    ctx.beginPath(); ctx.arc(0, porthY, pR2, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = tealDim;
    ctx.lineWidth   = 0.6;
    ctx.beginPath();
    ctx.moveTo(-pR2, porthY); ctx.lineTo(pR2, porthY);
    ctx.moveTo(0, porthY - pR2); ctx.lineTo(0, porthY + pR2);
    ctx.stroke();

    // Access hatch
    ctx.strokeStyle = dimCol;
    ctx.lineWidth = 0.7;
    const hatchY = sep1 + 2.5;
    ctx.strokeRect(-3.5, hatchY, 7, 5);
    ctx.beginPath(); ctx.moveTo(-1.5, hatchY + 2.5); ctx.lineTo(1.5, hatchY + 2.5); ctx.stroke();

    // RCS thruster nubs
    ctx.strokeStyle = dimCol;
    ctx.lineWidth   = 0.8;
    ctx.strokeRect(-hw - 3.5, sep1 - 2, 3.5, 3);
    ctx.strokeRect( hw,        sep1 - 2, 3.5, 3);

    // Fuel port dots
    ctx.fillStyle = dimCol;
    const fpY = sep2 + (bodyBot - sep2) * 0.45;
    ctx.beginPath(); ctx.arc(-hw + 3.5, fpY, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( hw - 3.5, fpY, 1.2, 0, Math.PI * 2); ctx.fill();

    // Delta fins with structural ribs
    const finRootTop = sep2, finRootBot = bodyBot, finRootH = finRootBot - finRootTop;
    const finTipX = hw + 12, finTipY = bodyBot + 2;

    ctx.strokeStyle = bodyCol;
    ctx.lineWidth   = 1.3;
    ctx.beginPath();
    ctx.moveTo(-hw, finRootTop); ctx.lineTo(-finTipX, finTipY); ctx.lineTo(-hw, finRootBot);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo( hw, finRootTop); ctx.lineTo( finTipX, finTipY); ctx.lineTo( hw, finRootBot);
    ctx.stroke();

    ctx.strokeStyle = dimCol;
    ctx.lineWidth   = 0.65;
    for (let r = 1; r <= 2; r++) {
      const t    = r / 3;
      const ry0  = finRootTop + finRootH * t;
      const tFrc = 0.48 + t * 0.20;
      const ry1  = ry0 + (finTipY - ry0) * (0.38 + t * 0.18);
      ctx.beginPath(); ctx.moveTo(-hw,  ry0); ctx.lineTo(-hw + (-finTipX + hw) * tFrc, ry1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo( hw,  ry0); ctx.lineTo( hw + ( finTipX - hw) * tFrc, ry1); ctx.stroke();
    }

    // Engine bell  bezier walls, throat, expansion rings, exit plane
    const bEntry = hw * 0.40, bExit = hw * 0.74;
    const throatY = bodyBot + 2.5;

    ctx.strokeStyle = tealCol;
    ctx.lineWidth   = 1.4;
    ctx.beginPath();
    ctx.moveTo(-bEntry, bodyBot);
    ctx.bezierCurveTo(-bEntry, bodyBot + 5, -bExit, bellExt - 5, -bExit, bellExt);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo( bEntry, bodyBot);
    ctx.bezierCurveTo( bEntry, bodyBot + 5,  bExit, bellExt - 5,  bExit, bellExt);
    ctx.stroke();

    ctx.strokeStyle = tealDim;
    ctx.lineWidth   = 0.8;
    ctx.beginPath(); ctx.moveTo(-hw * 0.32, throatY); ctx.lineTo(hw * 0.32, throatY); ctx.stroke();

    const ring1Y = throatY + (bellExt - throatY) * 0.38;
    const ring2Y = throatY + (bellExt - throatY) * 0.70;
    const ring1W = bEntry + (bExit - bEntry) * 0.38;
    const ring2W = bEntry + (bExit - bEntry) * 0.70;
    ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(-ring1W, ring1Y); ctx.lineTo(ring1W, ring1Y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-ring2W, ring2Y); ctx.lineTo(ring2W, ring2Y); ctx.stroke();

    ctx.strokeStyle = tealCol;
    ctx.lineWidth   = 1.2;
    ctx.beginPath(); ctx.moveTo(-bExit, bellExt); ctx.lineTo(bExit, bellExt); ctx.stroke();

    ctx.restore();
  }

  //  Button + label 
  const BTN_W = (hw + 12 + 4) * 2;
  const BTN_H = Math.round(hh + 10 + NOZZLE_DY + 10);
  const BTN_R = PAD_R - hw - 12 - 4;
  const BTN_B = footerH + 2;

  const btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Launch rocket');
  btn.style.cssText = [
    'position:fixed', `right:${BTN_R}px`, `bottom:${BTN_B}px`,
    `width:${BTN_W}px`, `height:${BTN_H}px`, 'z-index:9001',
    'background:none', 'border:none', 'padding:0', 'cursor:none',
    'opacity:0', 'transition:opacity .4s ease', 'outline:none', 'pointer-events:none',
  ].join(';');

  btn.addEventListener('click', () => {
    if (phase !== 'idle') return;
    rx = idleX(); ry = idleY(); vy = 0; igT = 0; lnT = 0;
    phase = 'ignite';
    btn.style.opacity = '0'; btn.style.pointerEvents = 'none';
  });

  document.body.appendChild(btn);

  //  Main loop 
  let prev = 0;

  function tick(ts) {
    const dt = Math.min((ts - prev) / 1000, 0.05);
    prev = ts;

    ctx.clearRect(0, 0, W, H);

    const targetA  = (visible || phase !== 'idle') ? 1 : 0;
    const fadeRate = targetA > rA ? dt * 0.9 : dt * 20;
    rA = Math.max(0, Math.min(1, rA + (targetA - rA) * fadeRate));

    if (phase === 'idle') {
      btn.style.opacity       = (rA * (visible ? 1 : 0)).toFixed(2);
      btn.style.pointerEvents = (visible && rA > 0.5) ? 'auto' : 'none';
    }

    if (rA < 0.01 && phase === 'idle') {
      _clearFlare();
      requestAnimationFrame(tick);
      return;
    }

    if (phase === 'idle') {
      _clearFlare();
      ctx.save(); ctx.globalAlpha = rA;
      drawRocket(idleX(), idleY(), 0);
      ctx.restore();

    } else if (phase === 'ignite') {
      igT += dt;
      const inten = Math.min(igT / 0.45, 1);
      _renderFlare(rx, ry + NOZZLE_DY, inten);
      drawRocket(rx, ry, inten * 2.2);
      if (igT >= 0.45) phase = 'launch';

    } else if (phase === 'launch') {
      lnT += dt;
      const ramp = Math.min(lnT / THRUST_RAMP, 1.0);
      vy += (GRAV - (THRUST_INIT + (THRUST_FULL - THRUST_INIT) * ramp * ramp)) * dt;
      ry += vy * dt;
      _renderFlare(rx, ry + NOZZLE_DY, 1.0);
      drawRocket(rx, ry, 0);

      if (ry + BH < -20) {
        phase = 'done';
        setTimeout(() => { window.location.href = 'mailto:work@interstellarscream.com'; }, 600);
        setTimeout(() => {
          rA = 0;   // start opacity at zero so it fades in rather than popping
          phase = 'idle';
        }, 5000);
      }

    } else {   // keep physics running so flame follows rocket off screen naturally
      lnT += dt;
      const ramp = Math.min(lnT / THRUST_RAMP, 1.0);
      vy += (GRAV - (THRUST_INIT + (THRUST_FULL - THRUST_INIT) * ramp * ramp)) * dt;
      ry += vy * dt;
      _renderFlare(rx, ry + NOZZLE_DY, 1.0);
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(ts => { prev = ts; checkScroll(); requestAnimationFrame(tick); });
}());
