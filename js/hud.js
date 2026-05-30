let frameCount = 0;

// Cached DOM refs
const _hSig    = document.getElementById('h-sig');
const _hFreq   = document.getElementById('h-freq');
const _hFrame  = document.getElementById('h-frame');
const _hAmp    = document.getElementById('h-amp');
const _hEnt    = document.getElementById('h-ent');
const _hLat    = document.getElementById('h-lat');
const _hLon    = document.getElementById('h-lon');
const _hPCount = document.getElementById('h-pcount');

// Smoothed display values to prevent jarring flicker
let _smoothVel   = 0;
let _smoothOrbit = 0;

function updateHUD(T) {
  frameCount++;

  //  Frame counter 
  _hFrame.textContent = frameCount.toString().padStart(6, '0');

  //  Cursor distance + angle from BH center 
  const cursorOn = heroMX > 0 && heroMX < 1 && heroMY > 0 && heroMY < 1;
  if (cursorOn) {
    const cx  = W * 0.5, cy = H * 0.5;
    const mx  = heroMX * W, my = heroMY * H;
    const dx  = mx - cx, dy = my - cy;
    const dst = Math.sqrt(dx * dx + dy * dy);
    const ang = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
    _hLat.textContent = dst.toFixed(0) + ' px';
    _hLon.textContent = ang.toFixed(1) + '°';
  } else {
    _hLat.textContent = '— —';
    _hLon.textContent = '— —';
  }

  //  Disc density - inner particles as a bar 
  const innerPct = Math.min(100, (hudMetrics.innerCount / N) * 100 * 6);
  const bars = Math.round(innerPct / 12.5);
  _hSig.textContent = '█'.repeat(bars) + '░'.repeat(8 - bars) + ' ' + innerPct.toFixed(1) + '%';

  //  Avg velocity - smoothed so it doesn't strobe 
  _smoothVel += (hudMetrics.avgVelocity - _smoothVel) * 0.08;
  _hFreq.textContent = _smoothVel.toFixed(2) + ' px/f';

  //  Consumed per second 
  const c = hudMetrics.consumedSec;
  _hEnt.textContent = c > 0 ? `ABSORBING  ${c}/s` : 'STABLE';

  //  Mean orbit radius - smoothed 
  _smoothOrbit += (hudMetrics.meanOrbit - _smoothOrbit) * 0.05;
  _hAmp.textContent = _smoothOrbit.toFixed(0) + ' px';

  //  Live particle count + trend direction 
  const trendSym = _pTrend > 0 ? ' ▲' : _pTrend < 0 ? ' ▼' : '';
  _hPCount.textContent = (N / 1000).toFixed(0) + 'k' + trendSym;
}
