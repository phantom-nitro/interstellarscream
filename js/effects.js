/**
 * Visual effects:
 *   drawWarpGrid  spacetime-distorted background grid
 *
 * Globals consumed: CONFIG, W, H, bhX(), bhY(), ctx, noise2
 */

//  Warp grid 

// Pre-allocated intersection buffers  avoids per-frame GC pressure
let _wx = new Float32Array(0);
let _wy = new Float32Array(0);

function drawWarpGrid(T) {
  const cx   = bhX(), cy = bhY();
  const cols = Math.ceil(W / CONFIG.GRID_CELL_W) + 2;
  const rows = Math.ceil(H / CONFIG.GRID_CELL_H) + 2;
  const stride = cols + 1;           // columns per row in the position grid
  const total  = stride * (rows + 1);

  if (_wx.length < total) {
    _wx = new Float32Array(total);
    _wy = new Float32Array(total);
  }

  // Hoist CONFIG values
  const GCW      = CONFIG.GRID_CELL_W;
  const GCH      = CONFIG.GRID_CELL_H;
  const PULL_R   = W * CONFIG.GRID_PULL_FRAC;
  const WARP_MAX = CONFIG.GRID_WARP_MAX;
  const T04      = T * 0.04;
  const T03      = T * 0.03;

  // Compute all warped intersection positions once  both row and col passes share these
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      const bx = col * GCW;
      const by = row * GCH;
      const dx = bx - cx, dy = by - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const pull = Math.max(0, 1 - dist / PULL_R);
      const warpN = noise2(bx * 0.004 + T04, by * 0.004 + T03) * 0.3;
      const warpStrength = pull * pull * WARP_MAX + warpN * 20;
      const invD  = 1 / dist;
      const idx   = row * stride + col;
      _wx[idx] = bx - dx * invD * warpStrength;
      _wy[idx] = by - dy * invD * warpStrength;
    }
  }

  ctx.save();
  ctx.lineWidth = 0.5;

  // Row lines (reuse precomputed positions)
  for (let row = 0; row <= rows; row++) {
    ctx.beginPath();
    const base = row * stride;
    ctx.moveTo(_wx[base], _wy[base]);
    for (let col = 1; col <= cols; col++) {
      ctx.lineTo(_wx[base + col], _wy[base + col]);
    }
    ctx.strokeStyle = `rgba(126,207,179,${0.03 + 0.018 * Math.sin(row * 0.6 + T)})`;
    ctx.stroke();
  }

  // Column lines (reuse same positions)
  for (let col = 0; col <= cols; col++) {
    ctx.beginPath();
    ctx.moveTo(_wx[col], _wy[col]);
    for (let row = 1; row <= rows; row++) {
      ctx.lineTo(_wx[row * stride + col], _wy[row * stride + col]);
    }
    ctx.strokeStyle = `rgba(126,207,179,${0.025 + 0.012 * Math.sin(col * 0.5 + T * 0.8)})`;
    ctx.stroke();
  }

  ctx.restore();
}
