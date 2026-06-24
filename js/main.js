/**
 * main.js  canvas setup, hero animation loop, scroll reveal.
 * Loaded last; all helper modules (config, particles, blackhole, etc.) are
 * already defined by the time this runs.
 */

//  Hero canvas 

const cv  = document.getElementById('mainCanvas');
const ctx = cv.getContext('2d');
let W, H;

function resizeMain() {
  W = cv.width  = cv.offsetWidth;
  H = cv.height = cv.offsetHeight;
}

// Black hole position  springs toward scroll-set targets
let _bhXFrac    = 0.5;
let _bhXTarget  = 0.5;
let _bhYFrac    = 0.5;
let _bhYTarget  = 0.5;

function bhX() { return W * _bhXFrac; }
function bhY() { return H * _bhYFrac; }

window.addEventListener('resize', resizeMain);

//  Mouse tracking (normalised 0…1 within the hero viewport) 
// heroMX/heroMY are set to -1 when the hero section is not the active scene
// so particle attraction and the cursor field glow both go dormant.

let heroMX = 0.5, heroMY = 0.5;
let _heroSceneActive = true;

// DOM refs for scroll-driven hero animation
const _heroPhrase  = document.getElementById('heroPhrase');
const _heroText    = document.querySelector('.hero-text');
const _heroHuds    = document.querySelectorAll('.hud');
// const _heroXhair   = document.querySelector('.xhair');
const _starfieldCv = document.getElementById('starfield');

let _issActive = false;

function _updateHero() {
  const s  = window.scrollY;
  const vh = window.innerHeight;
  // 300vh wrap → 200vh sticky scroll → hp 0→1 over 2×vh
  const hp = Math.min(s / (2 * vh), 1);

  _heroSceneActive = s < 1.8 * vh;
  if (!_heroSceneActive) { heroMX = -1; heroMY = -1; }

  // HUDs + crosshair: fade out by ~15% of total scroll
  const hAlpha = Math.max(0, 1 - s / (vh * 0.30));
  _heroHuds.forEach(h => { h.style.opacity = hAlpha; });
//   if (_heroXhair) _heroXhair.style.opacity = hAlpha;

  // BH X: fixed centre
//   const tProg = Math.max(0, Math.min(1, (s - vh * 0.15) / (vh * 0.57)));
//   _bhXTarget  = tProg >= 0.85 ? 0.68 : 0.5;
  _bhXTarget  = 0.5;

  // BH Y: wait after snap (until hp≈0.42), then exits fully off-screen top (hp 0.42→0.57)
  // At hp 0.57, BH centre is at H×−0.35  completely above the viewport
  const bhYP  = Math.max(0, Math.min(1, (hp - 0.42) / 0.15));
  _bhYTarget  = 0.5 - bhYP * 0.85;

  // hero copy reveals together once the BH has cleared the viewport
  // hp>= 0.58: phrase upper left, IS, transmission bottom
  _issActive = hp >= 0.58;
  if (_heroPhrase) {
    _heroPhrase.style.opacity = _issActive ? '1' : '0';
    // pop offset lives in a CSS var so the breakpoint owns base positioning
    _heroPhrase.style.setProperty('--pop', _issActive ? '0px': '18px');
  }
  if (_heroText) {
    _heroText.style.opacity   = _issActive ? '1' : '0';
    _heroText.style.transform = _issActive ? 'translateY(0)' : 'translateY(18px)';
  }
}

window.addEventListener('scroll', _updateHero, { passive: true });

document.addEventListener('mousemove', e => {
  if (!_heroSceneActive) return;
  heroMX = e.clientX / W;
  heroMY = e.clientY / H;
});

//  Adaptive particle count  work-time based (vsync-immune) 
// Measures actual CPU/GPU work per frame via performance.now(), not rAF delta.
// rAF delta is always ~16ms at 60fps vsync regardless of load, so it can't
// distinguish "16ms of work" from "2ms of work + 14ms waiting for vsync".

let   _targetN = CONFIG.PARTICLE_COUNT; // goal N  ramps smoothly each frame
let   _ftBuf   = new Float32Array(90);
let   _ftHead  = 0;
let   _ftFull  = false;
let   _ftCheck = 0;
let   _pTrend  = 0;   // -1 = stepping down, 0 = stable, +1 = stepping up

function _adaptParticles(workMs) {
  _ftBuf[_ftHead] = workMs;
  _ftHead = (_ftHead + 1) % 90;
  if (_ftHead === 0) _ftFull = true;
  if (!_ftFull) return;
  if (++_ftCheck < 120) return;    // re-evaluate every ~2s
  _ftCheck = 0;

  let sum = 0;
  for (let i = 0; i < 90; i++) sum += _ftBuf[i];
  const avg = sum / 90;

  if (avg < 10 && _targetN < 100000) {
    _targetN = Math.min(100000, _targetN + 10000);
    _pTrend = 1;
  } else if (avg > 14 && _targetN > 20000) {
    _targetN = Math.max(20000, _targetN - 10000);
    _pTrend = -1;
  } else {
    _pTrend = 0;
  }
}

//  Hero animation loop 

let T = 0;

function heroLoop() {
  const _t0 = performance.now();

  T += CONFIG.T_STEP;

  // Spring BH position toward targets (~200ms snap at 60fps)
  _bhXFrac += (_bhXTarget - _bhXFrac) * 0.22;
  _bhYFrac += (_bhYTarget - _bhYFrac) * 0.12;   // slower vertical drift

  // Motion-blur trail: low-alpha fill instead of clearRect
  ctx.fillStyle = `rgba(4,4,10,${CONFIG.MOTION_BLUR})`;
  ctx.fillRect(0, 0, W, H);

  // ISS section: blit starfield onto canvas with screen composite so stars
  // show through without affecting the BH section (different stacking context)
  if (_issActive && _starfieldCv) {
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(_starfieldCv, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  rampParticleCount(_targetN, 800); // smooth N toward target at 800 particles/frame
  drawWarpGrid(T);
  stepParticles(CONFIG.PHYSICS_DT); // BH shadow is stamped inside this call
  drawCursorField();
  updateHUD(T);

  _adaptParticles(performance.now() - _t0);
  requestAnimationFrame(heroLoop);
}

//  Initialise 

function init() {
  resizeMain();       // sets W and H before any particle or draw code runs
  initParticles();    // spawns particles using W/H/bhX/bhY
  initKineticText();  // character-scramble typography on hero h1
  heroLoop();
  _updateHero();      // set initial text/HUD state before first scroll
}
init();

//  Marquee

(function () {
  const inner = document.querySelector('.mq-inner');
  if (!inner) return;

  let x = 0, halfW = 0;

  function measure() { halfW = inner.scrollWidth / 2; }

  function tickMq() {
    x -= 0.55;
    if (halfW && x <= -halfW) x += halfW;
    inner.style.transform = `translateX(${x}px)`;
    requestAnimationFrame(tickMq);
  }

  document.fonts.ready.then(() => { measure(); tickMq(); });
  window.addEventListener('resize', measure);
}());

//  Scroll reveal 

const io = new IntersectionObserver(
  entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); }),
  { threshold: 0.1 }
);
document.querySelectorAll('.reveal').forEach(el => io.observe(el));
