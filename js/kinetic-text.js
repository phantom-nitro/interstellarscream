/**
 * kinetic-text.js — 5×7 dot matrix with independent per-character glyph animations.
 *
 * Global animations: column wipe, row scan, pulse, char sequence.
 * Per-character: each letter independently flips to a random glyph on its own
 * timer, then snaps back.  Nothing Phone aesthetic — fast mechanical transitions.
 *
 * Pac-Man path (U-shape, fully inside the text matrix):
 *   Phase 0 — facing LEFT,  sweeps R→I across INTERSTELLAR (row 3, middle row)
 *   Phase 1 — facing DOWN,  descends from INTERSTELLAR level to SCREAM level
 *   Phase 2 — facing RIGHT, sweeps S→M across SCREAM (row 3, middle row)
 * Sprite is 5 wide × 7 tall — fits exactly in one 5×7 character cell.
 *
 * Canvas is position:fixed at body level — fully decoupled from #mainCanvas.
 */

// ── 5×7 dot matrix font ───────────────────────────────────────────────────────
// 7 rows, each row = 5-bit mask (bit 4 = leftmost column)
const _DM = {
  A:[0b00100,0b01010,0b10001,0b10001,0b11111,0b10001,0b10001],
  C:[0b01110,0b10001,0b10000,0b10000,0b10000,0b10001,0b01110],
  E:[0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b11111],
  I:[0b11111,0b00100,0b00100,0b00100,0b00100,0b00100,0b11111],
  L:[0b10000,0b10000,0b10000,0b10000,0b10000,0b10000,0b11111],
  M:[0b10001,0b11011,0b10101,0b10001,0b10001,0b10001,0b10001],
  N:[0b10001,0b11001,0b10101,0b10011,0b10001,0b10001,0b10001],
  R:[0b11110,0b10001,0b10001,0b11110,0b10100,0b10010,0b10001],
  S:[0b01111,0b10000,0b10000,0b01110,0b00001,0b00001,0b11110],
  T:[0b11111,0b00100,0b00100,0b00100,0b00100,0b00100,0b00100],
};

// ── Glyph library ─────────────────────────────────────────────────────────────
const _GL = [
  // ── Abstract / geometric ─────────────────────────────────────────────────
  [0b01110,0b10001,0b10101,0b10001,0b10101,0b10001,0b01110], // ⊕  target
  [0b11111,0b10001,0b10001,0b11111,0b10001,0b10001,0b11111], // #  grid
  [0b00100,0b01110,0b11111,0b00100,0b11111,0b01110,0b00100], // ✚  fat cross
  [0b10101,0b01010,0b10101,0b01010,0b10101,0b01010,0b10101], //    checkerboard
  [0b11111,0b00000,0b11111,0b00000,0b11111,0b00000,0b11111], //    h-stripes
  [0b11111,0b10001,0b10001,0b10001,0b10001,0b10001,0b11111], // □  rectangle
  [0b00100,0b01010,0b10001,0b11111,0b10001,0b01010,0b00100], // ◇  diamond
  [0b10101,0b01110,0b11111,0b11111,0b11111,0b01110,0b10101], // ✦  star burst
  [0b00111,0b00110,0b01110,0b01100,0b11100,0b10000,0b00000], // ⚡  lightning
  [0b01010,0b10101,0b01110,0b11111,0b01110,0b10101,0b01010], // ✳  snowflake
  // ── Faces / cute ─────────────────────────────────────────────────────────
  [0b00000,0b01010,0b00000,0b10001,0b01110,0b00000,0b00000], // :) smiley
  [0b00000,0b01010,0b00000,0b01110,0b10001,0b00000,0b00000], // :( sad
  [0b00000,0b01010,0b00000,0b01110,0b10001,0b01110,0b00000], // :O surprised
  [0b01010,0b01010,0b00000,0b10001,0b01110,0b00000,0b00000], // ;) wink
  [0b00000,0b01010,0b00000,0b00100,0b01010,0b00000,0b00000], // :| neutral
  // ── Symbols / icons ───────────────────────────────────────────────────────
  [0b00000,0b01010,0b11111,0b11111,0b01110,0b00100,0b00000], // ♥  heart
  [0b00100,0b01110,0b11111,0b11111,0b01110,0b00100,0b00000], // ▲  gem/diamond fill
  [0b00100,0b00100,0b00100,0b00100,0b01110,0b01010,0b00000], // ♩  music note
  [0b00100,0b01110,0b11111,0b00100,0b00100,0b00100,0b00000], // ↑  up arrow
  [0b00000,0b00100,0b00100,0b00100,0b11111,0b01110,0b00100], // ↓  down arrow
  [0b10101,0b10101,0b11111,0b11111,0b11111,0b00000,0b00000], // ♛  crown
  [0b11111,0b10101,0b11111,0b01110,0b11111,0b00100,0b00100], // 🤖 robot
  // ── Characters ───────────────────────────────────────────────────────────
  [0b01110,0b11111,0b10101,0b11111,0b11111,0b10101,0b00000], // 👻 ghost
  [0b01110,0b11110,0b11100,0b11000,0b11100,0b11110,0b01110], // 🟡 pac-man right
  [0b01110,0b11111,0b10101,0b11111,0b01010,0b10001,0b00000], // 👾 alien
  [0b10001,0b01010,0b00100,0b01010,0b10001,0b00000,0b00000], // ✕  X
  [0b10001,0b01010,0b00100,0b01010,0b10001,0b01010,0b00100], // ✕  spinning X
  [0b10001,0b01010,0b00100,0b01110,0b01010,0b00000,0b00000], // 🐱 cat face
  [0b01110,0b10001,0b10001,0b01010,0b00100,0b01010,0b10001], // 💀 skull-ish
  [0b10101,0b01110,0b11111,0b01110,0b10101,0b00000,0b00000], // ☀  sun
  // ── Arrows ───────────────────────────────────────────────────────────────
  [0b00100,0b01000,0b11111,0b01000,0b00100,0b00000,0b00000], // ←  left arrow
  [0b00100,0b00010,0b11111,0b00010,0b00100,0b00000,0b00000], // →  right arrow
  // ── Nature ───────────────────────────────────────────────────────────────
  [0b01110,0b11000,0b10000,0b10000,0b10000,0b11000,0b01110], // 🌙 crescent moon
  [0b00100,0b01110,0b11111,0b01110,0b10101,0b00000,0b00000], // ⭐ star
  [0b01110,0b11111,0b10101,0b11111,0b01110,0b00100,0b00100], // 🍄 mushroom
  [0b00100,0b01110,0b11111,0b01110,0b11111,0b00100,0b00100], // 🌲 tree
  [0b01010,0b01110,0b10101,0b01110,0b00100,0b00100,0b00000], // 🌸 flower
  // ── Objects ──────────────────────────────────────────────────────────────
  [0b00100,0b01110,0b11111,0b11111,0b01110,0b00000,0b00100], // 🔔 bell + clapper
  [0b00010,0b01110,0b11111,0b11111,0b11111,0b01110,0b00000], // 💣 bomb
  [0b11111,0b01110,0b00100,0b00100,0b01110,0b11111,0b00000], // ⌛ hourglass
  [0b00100,0b01110,0b11111,0b11011,0b11011,0b11111,0b00000], // 🏠 house
  [0b11111,0b10101,0b01110,0b00100,0b01110,0b11111,0b00000], // 🏆 trophy
  [0b01110,0b10001,0b10001,0b11111,0b10101,0b11111,0b00000], // 🔒 lock
  [0b00100,0b01110,0b11111,0b01110,0b10101,0b10101,0b00000], // 🚀 rocket
  // ── Symbols ──────────────────────────────────────────────────────────────
  [0b01110,0b10001,0b00001,0b00010,0b00100,0b00000,0b00100], // ?  question mark
  [0b00100,0b00100,0b00100,0b00100,0b00100,0b00000,0b00100], // !  exclamation
  [0b01010,0b11111,0b01010,0b11111,0b01010,0b00000,0b00000], // #  hashtag
  // ── Creatures ────────────────────────────────────────────────────────────
  [0b10001,0b11011,0b11111,0b01010,0b00100,0b00000,0b00000], // 🦋 butterfly
  [0b01010,0b01110,0b10101,0b01110,0b10101,0b01110,0b00000], // 🐛 bug / ant
  [0b00110,0b01111,0b11111,0b01111,0b00110,0b00000,0b00000], // 🐟 fish
  [0b00111,0b01110,0b11111,0b01110,0b11100,0b00000,0b00000], // 🪐 planet + ring
  // ── More characters ──────────────────────────────────────────────────────
  [0b01110,0b10101,0b11111,0b01110,0b01010,0b00000,0b00000], // 💀 skull (clean)
  [0b00100,0b01110,0b10101,0b00100,0b00100,0b01010,0b00000], // 🕴  stick figure
  [0b01110,0b01111,0b00111,0b00011,0b00111,0b01111,0b01110], // 🟡 pac-man left
];

// ── Pac-Man directional sprites (5 wide × 7 tall) ─────────────────────────────
// Fits exactly within one 5×7 character cell.
// 7 rows, each row = 5-bit mask (bit 4 = leftmost col, bit 0 = rightmost col).
const _PAC_R = [  // facing RIGHT — mouth opens toward bit 0 (right edge)
  [0b01110,0b11111,0b11111,0b11111,0b11111,0b11111,0b01110], // closed
  [0b01110,0b11111,0b11111,0b11100,0b11111,0b11111,0b01110], // slight
  [0b01110,0b11110,0b11100,0b11000,0b11100,0b11110,0b01110], // open
];
const _PAC_L = [  // facing LEFT — mouth opens toward bit 4 (left edge)
  [0b01110,0b11111,0b11111,0b11111,0b11111,0b11111,0b01110],
  [0b01110,0b11111,0b11111,0b00111,0b11111,0b11111,0b01110],
  [0b01110,0b01111,0b00111,0b00011,0b00111,0b01111,0b01110],
];
const _PAC_D = [  // facing DOWN — mouth opens at bottom rows
  [0b01110,0b11111,0b11111,0b11111,0b11111,0b11111,0b01110],
  [0b01110,0b11111,0b11111,0b11111,0b01110,0b00100,0b00000],
  [0b01110,0b11111,0b11111,0b01110,0b00100,0b00000,0b00000],
];
const _PAC_SEQ = [0, 1, 2, 1]; // ping-pong at 80 ms per frame ≈ 3 chomps/s

const _FG    = '#e8e2d4';
const _SIG   = '#7ecfb3';
const _LINES = ['INTERSTELLAR', 'SCREAM'];

// ── Pac-Man path timing (ms) ──────────────────────────────────────────────────
// INTERSTELLAR: 12 chars, last char (R) at absCol 66, rightmost dot gridCol 70
// SCREAM:        6 chars, last char (M) at absCol 30, rightmost dot gridCol 34
// Pac-man overshoots each edge by _PAC_FADE pitch so every dot is fully eaten.
const _P0_DUR    = 1600; // left sweep: R (gridCol 70) → past I's left edge
const _P1_DUR    = 400;  // down: INTERSTELLAR mid-row → SCREAM mid-row
const _P2_DUR    = 900;  // right sweep: S left edge → past M's right edge
const _P0_END    = _P0_DUR;             // 1600
const _P1_END    = _P0_END + _P1_DUR;   // 2000
const _P2_END    = _P1_END + _P2_DUR;   // 2900
const _PAC_TOTAL = _P2_END + 300;       // 3200 — then colwipe rebuilds text
const _PAC_FADE  = 2;  // eating-trail width in _pitch units (crisp mechanical eat)

// ── Runtime state ─────────────────────────────────────────────────────────────
let _kc, _kx;
let _pitch = 0, _dotR = 0, _lineGap = 0;
let _dots  = [];

// 'dormant' | 'reveal' | 'hold' | 'colwipe' | 'rowscan' | 'charseq' | 'pulse' | 'pacman'
let _mode     = 'dormant';
let _modeMs   = 0;
let _nextAnim = 0;
let _lastTs   = 0;

// Per-character independent flip state — state: 'idle' | 'out' | 'show' | 'in'
let _ca = [];

const _FLIP_TRANS = 40; // ms for enter/exit transitions

let _ready      = false;
let _triggered  = false;
let _loopActive = false;
let _h1El       = null;
let _heroTextEl = null;

// ── Init ──────────────────────────────────────────────────────────────────────
function initKineticText() {
  _kc = document.getElementById('kineticCanvas');
  if (!_kc) return;
  _kx = _kc.getContext('2d');
  if (!_kx) return;
  _h1El       = document.querySelector('.hero-h1');
  _heroTextEl = document.querySelector('.hero-text');
  document.fonts.ready.then(_ktSetup);
  window.addEventListener('resize', () => {
    _ready = false;
    if (_h1El) _h1El.style.opacity = '';
    requestAnimationFrame(() => requestAnimationFrame(_ktSetup));
  });
}

// ── Build dot grid ────────────────────────────────────────────────────────────
function _ktSetup() {
  if (!_h1El || !_heroTextEl) return;

  _kc.width  = window.innerWidth;
  _kc.height = window.innerHeight;

  const fs = parseFloat(window.getComputedStyle(_h1El).fontSize);
  _pitch   = Math.max(7, fs * 0.135);

  const widest = Math.max(_LINES[0].length, _LINES[1].length);
  const lineCols = (widest - 1) * 6 + 5;
  const leftPad = _h1El.getBoundingClientRect().left;
  const avail = window.innerWidth - leftPad * 2;
  if (avail > 0) _pitch = Math.min(_pitch, avail / lineCols);

  _dotR    = _pitch * 0.30;
  _lineGap = _pitch * 2.4;

  _dots = [];

  for (let li = 0; li < _LINES.length; li++) {
    const str   = _LINES[li];
    const color = li === 0 ? _FG : _SIG;
    const baseY = li === 0 ? 0 : 7 * _pitch + _lineGap;
    let   absCol = 0;

    for (let ci = 0; ci < str.length; ci++) {
      const pat  = _DM[str[ci]] || _DM['I'];
      const gIdx = (li === 0 ? 0 : _LINES[0].length) + ci;
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          _dots.push({
            lx:      (absCol + col) * _pitch,
            ly:      baseY + row * _pitch,
            isOn:    !!(pat[row] & (1 << (4 - col))),
            col, row,
            color,
            line:    li,
            charIdx: ci,
            gridCol: absCol + col,
            gIdx,
          });
        }
      }
      absCol += 6;
    }
  }

  const total = _LINES[0].length + _LINES[1].length;
  _ca = Array.from({ length: total }, (_, i) => ({
    state:   'idle',
    ms:      0,
    nextMs:  3000 + Math.random() * 9000 + i * 120,
    pattern: null,
    holdMs:  0,
  }));

  _ready     = true;
  _triggered = false;
  _mode      = 'dormant';
  _modeMs    = 0;

  if (_h1El) _h1El.style.opacity = '0';

  if (!_loopActive) {
    _loopActive = true;
    requestAnimationFrame(_ktLoop);
  }
}

// ── rAF loop ──────────────────────────────────────────────────────────────────
function _ktLoop(ts) {
  const dt = _lastTs ? Math.min(ts - _lastTs, 50) : 16;
  _lastTs = ts;

  if (_ready && !_triggered && _heroTextEl) {
    const op = parseFloat(_heroTextEl.style.opacity) || 0;
    if (op > 0.08) {
      _triggered = true;
      _enterMode('reveal');
    }
  }

  if (_triggered) {
    _modeMs += dt;
    _ktUpdate(dt);
  }

  _ktDraw();
  requestAnimationFrame(_ktLoop);
}

// ── Mode transitions ──────────────────────────────────────────────────────────
function _enterMode(m) {
  _mode   = m;
  _modeMs = 0;
  if (m === 'hold') _nextAnim = 4000 + Math.random() * 5000;
}

function _ktUpdate(dt) {
  if (_mode === 'pacman' && _modeMs > _PAC_TOTAL) { _enterMode('colwipe'); return; }

  const DUR = { reveal:950, colwipe:650, rowscan:850, charseq:1400, pulse:1500 };
  if (DUR[_mode] && _modeMs > DUR[_mode]) { _enterMode('hold'); return; }

  if (_mode === 'hold') {
    if (_modeMs > _nextAnim) {
      const pool = ['colwipe', 'rowscan', 'charseq', 'pulse'];
      const next = Math.random() < 0.08
        ? 'pacman'
        : pool[Math.floor(Math.random() * pool.length)];
      _enterMode(next);
    }
    _updateCharFlips(dt);
  }
}

// ── Per-character independent flip update ─────────────────────────────────────
function _updateCharFlips(dt) {
  for (const c of _ca) {
    c.ms += dt;
    if (c.state === 'idle') {
      if (c.ms >= c.nextMs) {
        c.state   = 'out';
        c.ms      = 0;
        c.pattern = _GL[Math.floor(Math.random() * _GL.length)];
        c.holdMs  = 300 + Math.random() * 700;
      }
    } else if (c.state === 'out') {
      if (c.ms >= _FLIP_TRANS) { c.state = 'show'; c.ms = 0; }
    } else if (c.state === 'show') {
      if (c.ms >= c.holdMs)    { c.state = 'in';   c.ms = 0; }
    } else if (c.state === 'in') {
      if (c.ms >= _FLIP_TRANS) {
        c.state  = 'idle';
        c.ms     = 0;
        c.nextMs = 2500 + Math.random() * 8000;
      }
    }
  }
}

// ── Pac-Man position helper ───────────────────────────────────────────────────
// Returns { lx, ly, dir } — lx/ly in pixels relative to the text origin rect.
function _getPacPos() {
  const t     = _modeMs;
  const midY0 = 3 * _pitch;                         // middle row of INTERSTELLAR
  const midY1 = 7 * _pitch + _lineGap + 3 * _pitch; // middle row of SCREAM
  // Start at R's rightmost dot (gridCol 70); overshoot left so all of I is eaten
  const iStart = 70 * _pitch;
  const iEnd   = -_PAC_FADE * _pitch;
  // Overshoot right so all of M is eaten
  const sEnd   = (34 + _PAC_FADE) * _pitch;

  if (t <= _P0_END) {
    return { lx: iStart + (iEnd - iStart) * (t / _P0_DUR), ly: midY0, dir: 'L' };
  }
  if (t <= _P1_END) {
    const p = (t - _P0_END) / _P1_DUR;
    return { lx: iEnd, ly: midY0 + (midY1 - midY0) * p, dir: 'D' };
  }
  const p = Math.min(1, (t - _P1_END) / _P2_DUR);
  return { lx: iEnd + (sEnd - iEnd) * p, ly: midY1, dir: 'R' };
}

// ── Alpha calculation ─────────────────────────────────────────────────────────
const _ON  = 0.92;
const _OFF = 0.07;
const _GON = 0.80;

function _dotAlpha(d) {
  const t = _modeMs;

  // ── Per-character flip override (only during 'hold') ──────────────────────
  if (_mode === 'hold') {
    const c = _ca[d.gIdx];
    if (c && c.state !== 'idle') {
      const gOn = c.pattern ? !!(c.pattern[d.row] & (1 << (4 - d.col))) : false;
      if (c.state === 'out') {
        const p = c.ms / _FLIP_TRANS;
        return (d.isOn ? _ON : _OFF) * (1 - p);
      }
      if (c.state === 'show') {
        const p = Math.min(1, c.ms / _FLIP_TRANS);
        return gOn ? _GON * p : _OFF * (1 - p * 0.4);
      }
      if (c.state === 'in') {
        const p = c.ms / _FLIP_TRANS;
        return gOn
          ? _GON * (1 - p) + _OFF * p
          : _OFF + (d.isOn ? _ON - _OFF : 0) * p;
      }
    }
  }

  switch (_mode) {
    case 'dormant': return 0;

    case 'reveal': {
      const maxC = d.line === 0 ? 71 : 35;
      const p    = Math.min(1, t / 850);
      const cf   = d.gridCol / maxC;
      if (p < cf) return _OFF * 0.5;
      const fd = p - cf;
      if (fd < 0.045) {
        const f = 1 - fd / 0.045;
        return d.isOn ? Math.min(1, _ON + 0.08 * f) : _OFF + 0.55 * f;
      }
      return d.isOn ? _ON : _OFF;
    }

    case 'hold': return d.isOn ? _ON : _OFF;

    case 'colwipe': {
      const maxC = d.line === 0 ? 71 : 35;
      const p    = Math.min(1, t / 580);
      const cf   = d.gridCol / maxC;
      if (p < cf) return _OFF;
      const fd = p - cf;
      if (fd < 0.05) {
        const f = 1 - fd / 0.05;
        return d.isOn ? Math.min(1, _ON + 0.08 * f) : _OFF + 0.6 * f;
      }
      return d.isOn ? _ON : _OFF;
    }

    case 'rowscan': {
      const absRow  = d.line === 0 ? d.row : d.row + 10;
      const scanPos = (t / 750) * 17;
      const dist    = Math.abs(absRow - scanPos);
      const flash   = Math.max(0, 1 - dist * 1.5);
      return (d.isOn ? _ON : _OFF) + flash * 0.75;
    }

    case 'charseq': {
      const total     = _LINES[0].length + _LINES[1].length;
      const globalIdx = (d.line === 0 ? 0 : _LINES[0].length) + d.charIdx;
      const cf        = globalIdx / total;
      const p         = Math.min(1, t / 1300);
      if (p < cf) return _OFF * 0.4;
      const fd = p - cf;
      if (fd < 0.04) {
        const f = 1 - fd / 0.04;
        return d.isOn ? Math.min(1, _ON + 0.08 * f) : _OFF + 0.5 * f;
      }
      return d.isOn ? _ON : _OFF;
    }

    case 'pulse': {
      if (!d.isOn) return _OFF;
      const wave = 0.5 + 0.5 * Math.sin(t * 0.005 * Math.PI * 2);
      return _OFF + wave * (_ON - _OFF);
    }

    case 'pacman': {
      const FADE = _PAC_FADE * _pitch;

      if (d.line === 0) {
        // INTERSTELLAR: eaten right→left during phase 0; fully dark afterward.
        if (t >= _P0_END) return 0;
        // pacLx travels from gridCol 70 to -_PAC_FADE over P0_DUR ms
        const pacLx  = (70 - (70 + _PAC_FADE) * t / _P0_DUR) * _pitch;
        const behind = d.lx - pacLx; // positive = dot is right of mouth = already eaten
        if (behind >= FADE) return 0;
        if (behind > 0) {
          const fade = 1 - behind / FADE;
          return (d.isOn ? _ON : _OFF) * (d.isOn ? fade * fade : fade);
        }
        // Ahead of mouth: brighten nearest lit dots (about to be eaten)
        if (d.isOn && pacLx - d.lx < _pitch * 2) return Math.min(1, _ON * 1.2);
        return d.isOn ? _ON : _OFF;
      } else {
        // SCREAM: untouched during phases 0–1; eaten left→right during phase 2.
        if (t < _P1_END) return d.isOn ? _ON : _OFF;
        if (t >= _P2_END) return 0;
        // pacLx travels from -_PAC_FADE to (34 + _PAC_FADE) over P2_DUR ms
        const p      = (t - _P1_END) / _P2_DUR;
        const pacLx  = (-_PAC_FADE + (34 + 2 * _PAC_FADE) * p) * _pitch;
        const behind = pacLx - d.lx; // positive = dot is left of mouth = already eaten
        if (behind >= FADE) return 0;
        if (behind > 0) {
          const fade = 1 - behind / FADE;
          return (d.isOn ? _ON : _OFF) * (d.isOn ? fade * fade : fade);
        }
        if (d.isOn && d.lx - pacLx < _pitch * 2) return Math.min(1, _ON * 1.2);
        return d.isOn ? _ON : _OFF;
      }
    }

    default: return d.isOn ? _ON : _OFF;
  }
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function _ktDraw() {
  _kx.clearRect(0, 0, _kc.width, _kc.height);
  if (!_h1El || !_ready || !_triggered) return;

  // Respect scroll-driven opacity of the parent container so dots vanish
  // whenever .hero-text is hidden — the canvas is fixed and bypasses CSS opacity.
  const parentA = parseFloat((_heroTextEl && _heroTextEl.style.opacity) || '0');
  if (parentA < 0.01) return;

  const rect = _h1El.getBoundingClientRect();
  if (!rect.width) return;

  for (const d of _dots) {
    const a = _dotAlpha(d) * parentA;
    if (a < 0.01) continue;
    _kx.globalAlpha = a;
    _kx.fillStyle   = d.color;
    _kx.beginPath();
    _kx.arc(rect.left + d.lx, rect.top + d.ly, _dotR, 0, Math.PI * 2);
    _kx.fill();
  }

  // ── Pac-Man 5×7 sprite (inside the text matrix) ───────────────────────────
  if (_mode === 'pacman' && _modeMs < _P2_END + 100) {
    const { lx: pacLx, ly: pacLy, dir } = _getPacPos();
    const frames = dir === 'L' ? _PAC_L : dir === 'D' ? _PAC_D : _PAC_R;
    const frame  = _PAC_SEQ[Math.floor(_modeMs / 80) % _PAC_SEQ.length];
    const pat    = frames[frame];

    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (!(pat[r] & (1 << (4 - c)))) continue;
        _kx.globalAlpha = 0.97 * parentA;
        _kx.fillStyle   = '#FFD700';
        _kx.beginPath();
        _kx.arc(
          rect.left + pacLx + (c - 2) * _pitch,
          rect.top  + pacLy + (r - 3) * _pitch,
          _dotR, 0, Math.PI * 2
        );
        _kx.fill();
      }
    }
  }

  _kx.globalAlpha = 1;
}
