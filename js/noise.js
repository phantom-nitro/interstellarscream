const _p256 = Array.from({ length: 256 }, (_, i) => i);
for (let i = 255; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [_p256[i], _p256[j]] = [_p256[j], _p256[i]];
}
const _p = new Uint8Array(512);
for (let i = 0; i < 512; i++) _p[i] = _p256[i & 255];

function _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function _lerp(a, b, t) { return a + t * (b - a); }
function _grad(h, x, y) {
  const v = h & 3;
  return ((v < 2 ? x : y) * ((h & 1) ? -1 : 1))
       + ((v < 2 ? y : x) * ((h & 2) ? -1 : 1));
}

function noise2(x, y) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
  x -= Math.floor(x); y -= Math.floor(y);
  const u = _fade(x), v = _fade(y);
  const a = _p[X] + Y, b = _p[X + 1] + Y;
  return _lerp(
    _lerp(_grad(_p[a],     x,     y    ), _grad(_p[b],     x - 1, y    ), u),
    _lerp(_grad(_p[a + 1], x,     y - 1), _grad(_p[b + 1], x - 1, y - 1), u),
    v
  );
}
