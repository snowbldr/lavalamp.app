// The velocity the Dyed fluid view carries its dye by, on a coarse grid, with no DOM so it can be
// stepped headless beside the simulation. It only reads: the flow the Flow switch draws (the lamp's
// flowAt, the roll, eddies, pulses, splats and touches) sampled at each cell's centre, and the
// particles' own velocities binned into the cells, so the water around a moving blob is dragged with
// it and the wake behind it shows. Nothing here writes to the simulation (Robert: "I would expect
// the motion to still be the same and for the dye to track the motion").
export const DYE_FLOW_CELL = 40 // lamp px between the grid's samples, the Flow switch's arrow spacing (32 cost a third more)
// px/s at the ends of the encoding. Each velocity is 16 bits in two bytes (0.24 px/s a level): in one byte, 4.7 px/s a
// level, a slow eddy (the Turbulence knob's, 45 px/s at its peak) had about ten levels and its streamlines through the
// grid came out off round by 3 to 3.5% of their radius (0.04 to 0.14% from the same grid unrounded), which the dye wound
// into square spirals (Robert: "I keep seeing square swirls... things don't swirl like that irl").
// It was 600, and each of x and y was clamped there on its own, so a young drifter at the default Turb 600 (1050 to
// 1950 px/s at its core's edge, falling as it ages) had its flow bent onto the diagonals wherever both were over the
// cap: a square spiral, round again once the eddy had slowed under it (Robert: "they're square to start, then fade to
// normal spirals"; "the slow spirals don't seem to catch squares"). Measured in the page on a pinned drifter at 1621
// px/s, the streamlines' four-fold harmonic at 1.5 cores was 4.7% of the radius through the encoded grid against 0.5%
// unencoded. 8000 covers a drifter to Turb 2400 or so; past it the velocity is shortened as a whole (CLAMP_SPEED), so its
// direction stays true.
export const DYE_MAX_SPEED = 8000
const CLAMP_SPEED = DYE_MAX_SPEED * 0.999 // a velocity's length is held under the encoding's ends, not x and y apart (see DYE_MAX_SPEED)
const PARTICLE_WEIGHT = 2 // a cell with this many particles is half their mean velocity, half the flow
const SPREAD = 2 // box blur passes over the grid, so a blob's drag reaches the water beside it
// The most particles read a frame: a cell's mean velocity needs only a sample of its lava, and binning all 53,000 of the
// GPU lamp's (most of them in the reservoirs, off screen) cost 0.65 ms a frame on Robert's Mac, a sample of 8000 a
// seventh of it. The sample is every k-th particle, the same ones each frame.
const MAX_SAMPLED = 8000

export function createDyeField () {
  let cols = 0
  let rows = 0
  let vx = new Float32Array(0)
  let vy = new Float32Array(0)
  let n = new Float32Array(0)
  let tx = new Float32Array(0)
  let ty = new Float32Array(0)
  let bytes = new Uint8Array(0)

  // width, height: the lamp's shown size in px. flowAt: the lamp's. flowGrid: the GPU lamp's own samples of the same field
  // (gpuSimulation.js createGpuLamp flowGrid), read in place of flowAt where there are any: on a 2560 by 1294 window in
  // a song, flowAt at every cell cost the frame about 5 ms more, since the GPU lamp's step had sampled it already.
  // state, count: the particles
  // (x, y, vx, vy in px and px/s). Returns the grid encoded as RGBA8, rows from the top: red and green the x velocity's
  // high and low byte, blue and alpha the y's (encode below; 128 and 0 still).
  function build ({ width, height, flowAt, flowGrid, state, count }) {
    const c = Math.max(1, Math.ceil(width / DYE_FLOW_CELL))
    const r = Math.max(1, Math.ceil(height / DYE_FLOW_CELL))
    if (c !== cols || r !== rows) {
      cols = c; rows = r
      const size = cols * rows
      vx = new Float32Array(size); vy = new Float32Array(size); n = new Float32Array(size)
      tx = new Float32Array(size); ty = new Float32Array(size)
      bytes = new Uint8Array(size * 4)
    }
    vx.fill(0); vy.fill(0); n.fill(0)
    const x = state && state.x
    const y = state && state.y
    const pvx = state && state.vx
    const pvy = state && state.vy
    if (x && pvx && pvy) {
      const m = Math.min(count, x.length, y.length, pvx.length, pvy.length)
      const inv = 1 / DYE_FLOW_CELL
      const every = Math.max(1, Math.ceil(m / MAX_SAMPLED))
      for (let i = 0; i < m; i += every) {
        const px = x[i]
        const py = y[i]
        if (!(px >= 0 && py >= 0)) continue
        const gx = (px * inv) | 0
        const gy = (py * inv) | 0
        if (gx >= cols || gy >= rows) continue
        const o = gx + gy * cols
        vx[o] += pvx[i]; vy[o] += pvy[i]; n[o] += 1
      }
    }
    const g = flowGrid && flowGrid.cols > 1 && flowGrid.rows > 1 ? flowGrid : null
    const flow = [0, 0]
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const o = gx + gy * cols
        if (g) sampleGrid(g, (gx + 0.5) * DYE_FLOW_CELL, (gy + 0.5) * DYE_FLOW_CELL, flow)
        else if (flowAt) { const f = flowAt((gx + 0.5) * DYE_FLOW_CELL, (gy + 0.5) * DYE_FLOW_CELL); flow[0] = f[0]; flow[1] = f[1] }
        const fx = flow[0]
        const fy = flow[1]
        const k = n[o]
        const w = k / (k + PARTICLE_WEIGHT)
        tx[o] = k > 0 ? fx + (vx[o] / k - fx) * w : fx
        ty[o] = k > 0 ? fy + (vy[o] / k - fy) * w : fy
      }
    }
    for (let pass = 0; pass < SPREAD; pass++) {
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          let sx = 0; let sy = 0; let s = 0
          for (let dy = -1; dy <= 1; dy++) {
            const yy = gy + dy
            if (yy < 0 || yy >= rows) continue
            for (let dx = -1; dx <= 1; dx++) {
              const xx = gx + dx
              if (xx < 0 || xx >= cols) continue
              const wgt = dx === 0 && dy === 0 ? 4 : 1
              const o = xx + yy * cols
              sx += tx[o] * wgt; sy += ty[o] * wgt; s += wgt
            }
          }
          const o = gx + gy * cols
          vx[o] = sx / s; vy[o] = sy / s
        }
      }
      const swapX = tx; tx = vx; vx = swapX
      const swapY = ty; ty = vy; vy = swapY
    }
    for (let o = 0, size = cols * rows; o < size; o++) {
      const speed = Math.hypot(tx[o], ty[o])
      if (speed > CLAMP_SPEED) { const k = CLAMP_SPEED / speed; tx[o] *= k; ty[o] *= k }
      encode(tx[o], bytes, o * 4)
      encode(ty[o], bytes, o * 4 + 2)
    }
    return { bytes, cols, rows, cell: DYE_FLOW_CELL }
  }

  return { build }
}

// A velocity as two bytes: u = 128 + v / DYE_MAX_SPEED * 128 in [0, 256), the high byte its whole part and the low
// byte its fraction in 256ths, so a still cell is 128 and 0 and decodes to exactly 0. The shader (dye.js) decodes it
// as (high - 128 + low / 256) / 128, which keeps every number under 256 for a phone's mediump floats.
function encode (v, out, at) {
  const u = Math.max(0, Math.min(255.996, 128 + v / DYE_MAX_SPEED * 128))
  let hi = Math.floor(u)
  let lo = Math.round((u - hi) * 256)
  if (lo > 255) { hi += 1; lo = 0 }
  if (hi > 255) { hi = 255; lo = 255 }
  out[at] = hi
  out[at + 1] = lo
}

// Bilinear between the grid's samples, which sit at gx * cell, gy * cell.
function sampleGrid ({ floats, at, stride, cols, rows, cell }, px, py, out) {
  const fx = Math.max(0, Math.min(cols - 1.001, px / cell))
  const fy = Math.max(0, Math.min(rows - 1.001, py / cell))
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  const a = at + (x0 + y0 * cols) * stride
  const b = a + stride
  const c = a + cols * stride
  const d = c + stride
  out[0] = (floats[a] * (1 - tx) + floats[b] * tx) * (1 - ty) + (floats[c] * (1 - tx) + floats[d] * tx) * ty
  out[1] = (floats[a + 1] * (1 - tx) + floats[b + 1] * tx) * (1 - ty) + (floats[c + 1] * (1 - tx) + floats[d + 1] * tx) * ty
}
