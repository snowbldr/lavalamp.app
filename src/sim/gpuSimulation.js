// The simulation on the GPU, in WebGPU compute shaders, behind the same shape as simulation.js:
// createGpuSimulation({ device, width, height, params }) gives { step, state, count, setTouches }.
// Robert: "yeah, do it. it's on the road for 3d anyway". The CPU could not get past about 6000
// particles at 60 fps (the lab liquid at radius 20: one particle per 106 px², a desktop window
// wants 30000 and its reservoirs as many again), and the last CPU trick, the sweep, changed the
// liquid. Here every particle is computed from the same snapshot (Jacobi), where the CPU's
// relaxation is sequential (Gauss-Seidel), so the two are the same model but not the same
// solver: the GPU wants more Settle passes to converge as far per frame.
//
// This first version carries the pinch lab's world: a flat box, the floor heater with its warm
// up front, fingers, gravity and heat, the carried velocity (Wobble, Kick, Cap, Skin), Reach,
// Wall, viscosity, conduction and Settle. Not yet: the stir and eddies, the heating elements and
// heat spots, the bottles and pots. Positions and temperatures come back to the CPU each frame
// for the renderer (one frame late); drawing from the GPU's own buffers is the next step.
//
// Every step is a fixed list of passes over one bind group:
//   drift      cool and heat each particle, ease its velocity toward its drift, move it
//   clear      zero the grid's counts
//   count      which cell each particle is in, counted
//   scan       cell starts, a prefix sum, one thread (the grid is a few thousand cells)
//   scatter    particles sorted into their cells
//   density    sum of kernel weights over the 3x3 cells, pressure and near pressure
//   relax      the pressure step: a particle's own move plus the pushes its neighbours' moves give
//              it, capped at Reach, into a second buffer that is then copied back
//   kick       the move carried as velocity on the skin, capped; walls and floor
//   viscosity  approaching neighbours slow each other, half the impulse each
//   conduct    temperature eased toward the neighbours' mean
// density and relax repeat for each extra Settle pass.

const WORKGROUP = 64
const MAX_TOUCHES = 4
const FIXED = 64 // the mean density is summed in fixed point: integer atomics are all WGSL has

const SHADER = /* wgsl */`
// Four storage buffers, not one per array: this device allows 8 per shader stage (the adapter
// 10), and the bind group had 15. V holds the vec2 arrays in sections of the capacity: pos, posOut, vel,
// velOut, px. F the f32 arrays: temp, tempOut, press, pressNear, dens. U the u32 arrays: cellOf,
// sorted, then cellStart. A the atomics: cellCount, then the mean density accumulator.
struct Params {
  n: u32,
  cols: u32,
  rows: u32,
  frame: u32,
  width: f32,
  height: f32,
  radius: f32,
  cell: f32,
  dt: f32,
  stiffness: f32,
  near: f32,
  rest: f32,
  maxTemp: f32,
  gravity: f32,
  size: f32,
  conduction: f32,
  wobble: f32,
  kick: f32,
  cap: f32,
  viscosity: f32,
  reach: f32,
  kickBelow: f32,
  wallPush: f32,
  share: f32,
  heater: f32,
  progress: f32,
  touchHeat: f32,
  touchRadius: f32,
  cooling: f32,
  touches: u32,
  capacity: u32,
  cellCap: u32,
  jacobi: f32,
  pad1: f32,
  pad2: f32,
  pad3: f32,
}
struct Touch { x: f32, y: f32, vx: f32, vy: f32, mode: u32, pad0: u32, pad1: u32, pad2: u32 }
struct Touches { t: array<Touch, ${MAX_TOUCHES}> }

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<uniform> T: Touches;
@group(0) @binding(2) var<storage, read_write> V: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> F: array<f32>;
@group(0) @binding(4) var<storage, read_write> U: array<u32>;
@group(0) @binding(5) var<storage, read_write> A: array<atomic<u32>>;

fn POS(i: u32) -> u32 { return i; }
fn POSOUT(i: u32) -> u32 { return P.capacity + i; }
fn VEL(i: u32) -> u32 { return 2u * P.capacity + i; }
fn VELOUT(i: u32) -> u32 { return 3u * P.capacity + i; }
fn PX(i: u32) -> u32 { return 4u * P.capacity + i; }
fn TEMP(i: u32) -> u32 { return i; }
fn TEMPOUT(i: u32) -> u32 { return P.capacity + i; }
fn PRESS(i: u32) -> u32 { return 2u * P.capacity + i; }
fn NEAR(i: u32) -> u32 { return 3u * P.capacity + i; }
fn DENS(i: u32) -> u32 { return 4u * P.capacity + i; }
fn CELLOF(i: u32) -> u32 { return i; }
fn SORTED(i: u32) -> u32 { return P.capacity + i; }
fn CELLSTART(c: u32) -> u32 { return 2u * P.capacity + c; }
fn COUNT(c: u32) -> u32 { return c; }
fn MEAN() -> u32 { return P.cellCap; }

// A hash of (particle, frame, salt) to a float in [0, 1).
fn hash(a: u32, b: u32, c: u32) -> f32 {
  var h = a * 747796405u + b * 2891336453u + c * 374761393u + 277803737u;
  h = (h ^ (h >> 17u)) * 0xed5ad4bbu;
  h = (h ^ (h >> 11u)) * 0xac4c1b51u;
  h = (h ^ (h >> 15u)) * 0x31848babu;
  h = h ^ (h >> 14u);
  return f32(h & 0x00ffffffu) / 16777216.0;
}
// random.js's randomNormalDistribution: a normal folded into 0 to 1, skewed, scaled, truncated.
fn skewedNormal(i: u32, salt: u32, lo: f32, hi: f32, skew: f32) -> f32 {
  let u = max(hash(i, P.frame, salt), 1e-7);
  let v = hash(i, P.frame, salt + 1u);
  var num = sqrt(-2.0 * log(u)) * cos(6.2831853 * v);
  num = clamp(num / 10.0 + 0.5, 0.0, 1.0);
  num = pow(num, skew);
  return trunc(num * (hi - lo) + lo);
}
fn cellX(x: f32) -> i32 { return clamp(i32(floor(x / P.cell)), 0, i32(P.cols) - 1); }
fn cellY(y: f32) -> i32 { return clamp(i32(floor(y / P.cell)), 0, i32(P.rows) - 1); }
fn cellIndex(p: vec2f) -> u32 { return u32(cellX(p.x)) + u32(cellY(p.y)) * P.cols; }

// The floor heater's power under x: a front from the middle while warming up, then full.
fn heaterPower(x: f32) -> f32 {
  if (P.heater < 0.5) { return 0.0; }
  if (P.progress >= 1.0) { return 1.0; }
  let half = P.width * 0.5;
  let r = abs(x - half) / half;
  let p = (P.progress * 1.2 - r) / 0.2;
  return clamp(p, 0.6, 1.0);
}

@compute @workgroup_size(${WORKGROUP})
fn drift(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i == 0u) { atomicStore(&A[MEAN()], 0u); }
  if (i >= P.n) { return; }
  var p = V[POS(i)];
  var t = F[TEMP(i)];
  // heat.js nextTemperature: cooling, then contact heating near the floor.
  if (t > 0.0) { t -= skewedNormal(i, 1u, 0.25, 2.75, 1.8) * P.cooling; }
  let fromFloor = P.height - p.y;
  if (p.y > P.height * 0.8 && t < P.maxTemp) {
    let d = max(1.0, abs(fromFloor));
    let inc = skewedNormal(i, 3u, 0.0, 5.0, 1.0) / d * heaterPower(p.x);
    t += inc;
    if (abs(fromFloor) < P.size) { t += inc * inc; }
  }
  // Fingers: heat, cool, push, pull, spin.
  var finger = vec2f(0.0, 0.0);
  for (var k = 0u; k < P.touches; k++) {
    let tc = T.t[k];
    let d = p - vec2f(tc.x, tc.y);
    let r = length(d);
    let q = r / P.touchRadius;
    if (q > 2.5) { continue; }
    let w = exp(-q * q);
    if (tc.mode == 3u) { t += P.touchHeat * w; }
    else if (tc.mode == 4u) { t -= P.touchHeat * w; }
    else if (tc.mode == 0u) { let u = select(vec2f(0.0), d / r, r > 0.0); finger += (250.0 * u + vec2f(tc.vx, tc.vy)) * w; }
    else if (tc.mode == 1u) { if (r > 0.0) { let speed = min(250.0 * w, r / P.dt); finger += -d / r * speed + vec2f(tc.vx, tc.vy) * w; } }
    else if (tc.mode == 2u) { let core = P.touchRadius * 0.5; let c = r / core; let speed = 300.0 * 2.0 * c / (1.0 + c * c) * exp(-(q * q) / 4.0); if (r > 0.0) { finger += vec2f(-d.y, d.x) / r * speed + vec2f(tc.vx, tc.vy) * w; } }
  }
  t = clamp(t, 0.0, P.maxTemp);
  F[TEMP(i)] = t;
  let drift = vec2f(finger.x, P.gravity - t + finger.y);
  var v = V[VEL(i)];
  if (P.wobble > 0.0) { v += (drift - v) * min(1.0, P.dt / P.wobble); } else { v = drift; }
  V[VEL(i)] = v;
  p += v * P.dt;
  V[PX(i)] = p;
  V[POS(i)] = p;
}

@compute @workgroup_size(${WORKGROUP})
fn clearCells(@builtin(global_invocation_id) id: vec3u) {
  let c = id.x;
  if (c < P.cols * P.rows) { atomicStore(&A[COUNT(c)], 0u); }
}

@compute @workgroup_size(${WORKGROUP})
fn countCells(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.n) { return; }
  let c = cellIndex(V[POS(i)]);
  U[CELLOF(i)] = c;
  atomicAdd(&A[COUNT(c)], 1u);
}

@compute @workgroup_size(1)
fn scan() {
  let cells = P.cols * P.rows;
  var sum = 0u;
  for (var c = 0u; c < cells; c++) {
    U[CELLSTART(c)] = sum;
    sum += atomicLoad(&A[COUNT(c)]);
    atomicStore(&A[COUNT(c)], 0u); // reused as the scatter cursor
  }
  U[CELLSTART(cells)] = sum;
}

@compute @workgroup_size(${WORKGROUP})
fn scatter(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.n) { return; }
  let c = U[CELLOF(i)];
  let k = U[CELLSTART(c)] + atomicAdd(&A[COUNT(c)], 1u);
  U[SORTED(k)] = i;
}

@compute @workgroup_size(${WORKGROUP})
fn density(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.n) { return; }
  let p = V[POS(i)];
  let cx = cellX(p.x);
  let cy = cellY(p.y);
  var d = 0.0;
  var dn = 0.0;
  for (var yy = max(cy - 1, 0); yy <= min(cy + 1, i32(P.rows) - 1); yy++) {
    for (var xx = max(cx - 1, 0); xx <= min(cx + 1, i32(P.cols) - 1); xx++) {
      let c = u32(xx) + u32(yy) * P.cols;
      let end = U[CELLSTART(c + 1u)];
      for (var k = U[CELLSTART(c)]; k < end; k++) {
        let j = U[SORTED(k)];
        if (j == i) { continue; }
        let r = length(V[POS(j)] - p);
        if (r >= P.radius) { continue; }
        let g = 1.0 - r / P.radius;
        d += g * g;
        dn += g * g * g;
      }
    }
  }
  F[DENS(i)] = d;
  F[PRESS(i)] = P.stiffness * (d - P.rest);
  F[NEAR(i)] = P.near * dn;
  atomicAdd(&A[MEAN()], u32(d * ${FIXED}.0));
}

// fluid.js relax, every particle at once: i's own move toward or away from each neighbour, and
// the share of each neighbour's move that lands on i, from the same positions.
@compute @workgroup_size(${WORKGROUP})
fn relax(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.n) { return; }
  let p = V[POS(i)];
  let cx = cellX(p.x);
  let cy = cellY(p.y);
  let dt2 = P.dt * P.dt;
  let pi = F[PRESS(i)];
  let ni = F[NEAR(i)];
  var own = vec2f(0.0, 0.0);
  var pushed = vec2f(0.0, 0.0);
  for (var yy = max(cy - 1, 0); yy <= min(cy + 1, i32(P.rows) - 1); yy++) {
    for (var xx = max(cx - 1, 0); xx <= min(cx + 1, i32(P.cols) - 1); xx++) {
      let c = u32(xx) + u32(yy) * P.cols;
      let end = U[CELLSTART(c + 1u)];
      for (var k = U[CELLSTART(c)]; k < end; k++) {
        let j = U[SORTED(k)];
        if (j == i) { continue; }
        let d = V[POS(j)] - p;
        let r = length(d);
        if (r >= P.radius || r == 0.0) { continue; }
        let g = 1.0 - r / P.radius;
        let u = d / r;
        own += u * ((pi * g + ni * g * g) * dt2);
        pushed -= u * ((F[PRESS(j)] * g + F[NEAR(j)] * g * g) * dt2) * P.share;
      }
    }
  }
  let cap = P.reach * P.radius;
  let shift = length(own);
  if (shift > cap) { own *= cap / shift; }
  // Every particle moves at once from the same snapshot, so two neighbours closing on each other
  // both take the whole step and cross; the sequential solver never does that. The move is scaled
  // by the Jacobi factor (under relaxation) and Settle passes make up the convergence.
  V[POSOUT(i)] = p + (pushed - own) * P.jacobi;
}

@compute @workgroup_size(${WORKGROUP})
fn copyPos(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i < P.n) { V[POS(i)] = V[POSOUT(i)]; }
}

@compute @workgroup_size(${WORKGROUP})
fn kick(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.n) { return; }
  var p = V[POS(i)];
  var v = V[VEL(i)];
  let onWall = p.x < 2.0 || p.x > P.width - 2.0;
  let mean = f32(atomicLoad(&A[MEAN()])) / ${FIXED}.0 / f32(P.n);
  var skin = false;
  if (P.kickBelow > 0.0) { skin = F[DENS(i)] < P.kickBelow * mean; } else { skin = F[PRESS(i)] < 0.0; }
  // The sequential solver computes a particle's move after half its neighbours have already
  // moved toward it, so its move, and the kick made from it, is about half the move computed from
  // one snapshot: the kick is scaled by the Jacobi factor (GPU Kick 3 measured as the CPU's Kick 6:
  // lamp area 17% against 16%, fastest particle 189 against 208 px/s, mean 62 against 77).
  if (P.wobble > 0.0 && skin && !onWall) {
    v += (p - V[PX(i)]) / P.dt * P.kick * P.jacobi;
    let speed = length(v);
    let limit = P.cap * P.gravity;
    if (speed > limit) { v *= limit / speed; }
  }
  // Walls take the momentum carried into them; the Wall margin eases lava off them.
  if (p.x < 0.0) { p.x = 0.0; v.x = max(v.x, 0.0); } else if (p.x > P.width) { p.x = P.width; v.x = min(v.x, 0.0); }
  if (P.wallPush > 0.0) {
    if (p.x < P.wallPush) { v.x += (P.wallPush - p.x) * 2.0; } else if (p.x > P.width - P.wallPush) { v.x -= (p.x - (P.width - P.wallPush)) * 2.0; }
  }
  if (p.y < 0.0) { p.y = 0.0; v.y = max(v.y, 0.0); } else if (p.y > P.height) { p.y = P.height; v.y = min(v.y, 0.0); }
  V[POS(i)] = p;
  V[VEL(i)] = v;
}

// fluid.js viscosity, every pair from both sides: each particle takes its half of the impulse.
@compute @workgroup_size(${WORKGROUP})
fn viscosity(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.n) { return; }
  let p = V[POS(i)];
  let vi = V[VEL(i)];
  var v = vi;
  if (P.viscosity > 0.0 && P.wobble > 0.0) {
    let cx = cellX(p.x);
    let cy = cellY(p.y);
    // The CPU applies the pairs one after another, each on the velocity the pairs before it left,
    // so a particle with a hundred approaching neighbours loses its approach once, not a hundred
    // times. Summed from one snapshot the impulses add up and the pool explodes (Viscosity 64:
    // 7500 px/s; 100: four hundred thousand). What a run of fractions w1, w2, ... leaves of the
    // approach is their product of (1 - w), about exp(-sum w), so the sum of impulses is scaled
    // to take away (1 - exp(-sum w)) of it in all.
    var impulse = vec2f(0.0, 0.0);
    var total = 0.0;
    for (var yy = max(cy - 1, 0); yy <= min(cy + 1, i32(P.rows) - 1); yy++) {
      for (var xx = max(cx - 1, 0); xx <= min(cx + 1, i32(P.cols) - 1); xx++) {
        let c = u32(xx) + u32(yy) * P.cols;
        let end = U[CELLSTART(c + 1u)];
        for (var k = U[CELLSTART(c)]; k < end; k++) {
          let j = U[SORTED(k)];
          if (j == i) { continue; }
          let d = V[POS(j)] - p;
          let r = length(d);
          if (r >= P.radius || r == 0.0) { continue; }
          let g = 1.0 - r / P.radius;
          let u = d / r;
          let approach = dot(vi - V[VEL(j)], u);
          if (approach <= 0.0) { continue; }
          let w = min(1.0, P.dt * g * P.viscosity) * 0.5;
          impulse += w * approach * u;
          total += w;
        }
      }
    }
    if (total > 0.0) { v -= impulse * ((1.0 - exp(-total)) / total); }
  }
  V[VELOUT(i)] = v;
}

@compute @workgroup_size(${WORKGROUP})
fn copyVel(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i < P.n) { V[VEL(i)] = V[VELOUT(i)]; }
}

@compute @workgroup_size(${WORKGROUP})
fn conduct(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.n) { return; }
  let p = V[POS(i)];
  let t = F[TEMP(i)];
  var weight = 0.0;
  var heat = 0.0;
  let cx = cellX(p.x);
  let cy = cellY(p.y);
  for (var yy = max(cy - 1, 0); yy <= min(cy + 1, i32(P.rows) - 1); yy++) {
    for (var xx = max(cx - 1, 0); xx <= min(cx + 1, i32(P.cols) - 1); xx++) {
      let c = u32(xx) + u32(yy) * P.cols;
      let end = U[CELLSTART(c + 1u)];
      for (var k = U[CELLSTART(c)]; k < end; k++) {
        let j = U[SORTED(k)];
        if (j == i) { continue; }
        let r = length(V[POS(j)] - p);
        if (r >= P.radius) { continue; }
        let g = 1.0 - r / P.radius;
        weight += g;
        heat += g * F[TEMP(j)];
      }
    }
  }
  let around = select(t, heat / weight, weight > 0.0);
  F[TEMPOUT(i)] = t + P.conduction * (around - t);
}

@compute @workgroup_size(${WORKGROUP})
fn copyTemp(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i < P.n) { F[TEMP(i)] = F[TEMPOUT(i)]; }
}
`

const TOUCH_MODES = { push: 0, pull: 1, spin: 2, heat: 3, cool: 4 }
const PARAM_FLOATS = 36 // the Params struct, 144 bytes

export function isWebGpuAvailable () {
  return typeof navigator !== 'undefined' && !!navigator.gpu
}

// The device, once per page.
let devicePromise = null
export function getGpuDevice () {
  if (!devicePromise) {
    devicePromise = (async () => {
      if (!isWebGpuAvailable()) return null
      const adapter = await navigator.gpu.requestAdapter()
      if (!adapter) return null
      return adapter.requestDevice()
    })()
  }
  return devicePromise
}

export function createGpuSimulation ({ device, width, height, params, random = Math.random }) {
  const capacity = Math.max(64, Math.ceil(params.particleCount / WORKGROUP) * WORKGROUP)
  let alive = 0
  let time = 0
  let heaterTime = 0
  let frame = 0
  let touches = []
  const state = {
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    temp: new Float32Array(capacity),
    p: new Float32Array(capacity),
    vx: new Float32Array(capacity),
    vy: new Float32Array(capacity),
    id: new Int32Array(capacity)
  }
  for (let i = 0; i < capacity; i++) state.id[i] = i

  const module = device.createShaderModule({ code: SHADER })
  module.getCompilationInfo().then(info => { for (const m of info.messages) if (m.type === 'error') console.error(`gpu shader ${m.lineNum}:${m.linePos} ${m.message}`) })
  const entries = ['drift', 'clearCells', 'countCells', 'scan', 'scatter', 'density', 'relax', 'copyPos', 'kick', 'viscosity', 'copyVel', 'conduct', 'copyTemp']
  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
    ]
  })
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] })
  const pipelines = {}
  for (const name of entries) pipelines[name] = device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: name } })

  const storage = (size) => device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST })
  const vec2Bytes = capacity * 8
  const f32Bytes = capacity * 4
  let cell = Math.max(4, params.interactionRadius)
  let cols = Math.ceil(width / cell) + 1
  let rows = Math.ceil(height / cell) + 1
  let cellCap = Math.max(cols * rows + 1, 64)
  const buffers = {
    params: device.createBuffer({ size: PARAM_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
    touches: device.createBuffer({ size: MAX_TOUCHES * 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
    V: storage(5 * vec2Bytes), // pos, posOut, vel, velOut, px
    F: storage(5 * f32Bytes), // temp, tempOut, press, pressNear, dens
    U: null, // cellOf, sorted, cellStart (sized with the grid)
    A: null // cellCount, mean accumulator
  }
  const sizeGrid = () => { buffers.U = storage((2 * capacity + cellCap) * 4); buffers.A = storage((cellCap + 1) * 4) }
  sizeGrid()
  const readPos = device.createBuffer({ size: vec2Bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
  const readTemp = device.createBuffer({ size: f32Bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
  const readPress = device.createBuffer({ size: f32Bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
  const readVel = device.createBuffer({ size: vec2Bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
  let bindGroup = makeBindGroup()
  function makeBindGroup () {
    const order = ['params', 'touches', 'V', 'F', 'U', 'A']
    return device.createBindGroup({ layout, entries: order.map((name, binding) => ({ binding, resource: { buffer: buffers[name] } })) })
  }
  function fitGrid () {
    const want = Math.max(4, params.interactionRadius)
    if (want === cell) return
    cell = want
    cols = Math.ceil(width / cell) + 1
    rows = Math.ceil(height / cell) + 1
    const needed = cols * rows + 1
    if (needed > cellCap) {
      cellCap = needed
      buffers.U.destroy()
      buffers.A.destroy()
      sizeGrid()
      bindGroup = makeBindGroup()
    }
  }

  // The lava arrives as a warm slab on the floor, as simulation.js spawns it.
  function fill (target) {
    target = Math.min(capacity, target)
    if (target <= alive) { alive = target; return }
    const spawnArea = params.spawnArea || 400
    const depth = Math.max(0, spawnArea * target / width)
    const xs = new Float32Array(2 * capacity)
    const ts = new Float32Array(capacity)
    for (let i = 0; i < alive; i++) { xs[2 * i] = state.x[i]; xs[2 * i + 1] = state.y[i]; ts[i] = state.temp[i] }
    for (let i = alive; i < target; i++) {
      const x = random() * width
      const y = (height - depth) + random() * depth // the same draws as simulation.js's spawn, so a seed gives both the same slab
      xs[2 * i] = x; xs[2 * i + 1] = y
      ts[i] = 0.8 * params.gravity
      state.x[i] = x; state.y[i] = y; state.temp[i] = ts[i]
    }
    alive = target
    device.queue.writeBuffer(buffers.V, 0, xs) // pos
    device.queue.writeBuffer(buffers.V, 4 * vec2Bytes, xs) // px
    device.queue.writeBuffer(buffers.V, 2 * vec2Bytes, new Float32Array(2 * capacity)) // vel
    device.queue.writeBuffer(buffers.F, 0, ts) // temp
  }

  const paramData = new ArrayBuffer(PARAM_FLOATS * 4)
  const pu = new Uint32Array(paramData)
  const pf = new Float32Array(paramData)
  const touchData = new ArrayBuffer(MAX_TOUCHES * 32)
  const tf = new Float32Array(touchData)
  const tu = new Uint32Array(touchData)

  function writeParams (dt) {
    const { interactionRadius, stiffness, stiffnessNear, restDensity, maxTemp, gravity, particleSize, conduction = 0.02, wobble = 0, wobbleKick = 1, wobbleMax = 2, viscosity = 0, reach = Infinity, kickBelow = 0, wallPush = 0, share = 0.1, heater = true, touchHeat = 12, touchRadius = 0 } = params
    pu[0] = alive; pu[1] = cols; pu[2] = rows; pu[3] = frame
    pf[4] = width; pf[5] = height; pf[6] = interactionRadius; pf[7] = cell
    pf[8] = dt; pf[9] = stiffness; pf[10] = stiffnessNear; pf[11] = restDensity
    pf[12] = maxTemp; pf[13] = gravity; pf[14] = particleSize; pf[15] = conduction
    pf[16] = wobble; pf[17] = wobbleKick; pf[18] = wobbleMax; pf[19] = viscosity
    pf[20] = Number.isFinite(reach) ? reach : 1e9; pf[21] = kickBelow; pf[22] = wallPush; pf[23] = share
    pf[24] = heater ? 1 : 0; pf[25] = Math.min(1, heaterTime / 2); pf[26] = touchHeat
    pf[27] = touchRadius > 0 ? touchRadius : Math.max(80, 0.12 * Math.min(width, height))
    pf[28] = height / 1000 // cooling scale, heat.js REFERENCE_HEIGHT
    pu[29] = Math.min(MAX_TOUCHES, touches.length)
    pu[30] = capacity
    pu[31] = cellCap
    pf[32] = params.jacobi ?? 0.5
    device.queue.writeBuffer(buffers.params, 0, paramData)
    for (let k = 0; k < MAX_TOUCHES; k++) {
      const t = touches[k]
      const o = k * 8
      tf[o] = t ? t.x : 0; tf[o + 1] = t ? t.y : 0; tf[o + 2] = t ? t.vx || 0 : 0; tf[o + 3] = t ? t.vy || 0 : 0
      tu[o + 4] = t ? (TOUCH_MODES[t.mode] ?? 0) : 0
    }
    device.queue.writeBuffer(buffers.touches, 0, touchData)
  }

  let reading = false
  let warned = false
  async function readBack () {
    if (reading) return
    reading = true
    try {
      await Promise.all([readPos.mapAsync(GPUMapMode.READ), readTemp.mapAsync(GPUMapMode.READ), readPress.mapAsync(GPUMapMode.READ), readVel.mapAsync(GPUMapMode.READ)])
      const xy = new Float32Array(readPos.getMappedRange())
      const t = new Float32Array(readTemp.getMappedRange())
      const pr = new Float32Array(readPress.getMappedRange())
      const v = new Float32Array(readVel.getMappedRange())
      const n = alive
      for (let i = 0; i < n; i++) { state.x[i] = xy[2 * i]; state.y[i] = xy[2 * i + 1]; state.vx[i] = v[2 * i]; state.vy[i] = v[2 * i + 1] }
      state.temp.set(t.subarray(0, n))
      state.p.set(pr.subarray(0, n))
      readPos.unmap(); readTemp.unmap(); readPress.unmap(); readVel.unmap()
    } catch (err) {
      if (!warned) { warned = true; console.warn('gpu readback', err) }
    }
    reading = false
  }

  function step (dt) {
    const target = Math.trunc(params.particleCount)
    if (target !== alive) fill(target)
    fitGrid()
    if (params.heater !== false) heaterTime += dt
    frame++
    writeParams(dt)
    // Settle counts full relaxation passes; the GPU runs each as two half moves (Jacobi factor
    // 0.5), which measured against the sequential CPU solver on a cold pool over ten seconds:
    // CPU pool top 839 px, density 24.8; GPU at one full Jacobi move 618 and 27.3 (a spray); at two
    // half moves 825 and 22.7; at three third moves 846 and 21.9.
    const settle = 2 * Math.max(1, Math.round(params.settle || 1))
    const groups = Math.ceil(alive / WORKGROUP)
    const cellGroups = Math.ceil((cols * rows) / WORKGROUP)
    const encoder = device.createCommandEncoder()
    const run = (name, count) => {
      const pass = encoder.beginComputePass()
      pass.setPipeline(pipelines[name])
      pass.setBindGroup(0, bindGroup)
      pass.dispatchWorkgroups(count)
      pass.end()
    }
    run('drift', groups)
    run('clearCells', cellGroups)
    run('countCells', groups)
    run('scan', 1)
    run('scatter', groups)
    for (let pass = 0; pass < settle; pass++) {
      run('density', groups)
      run('relax', groups)
      run('copyPos', groups)
    }
    run('kick', groups)
    run('viscosity', groups)
    run('copyVel', groups)
    run('conduct', groups)
    run('copyTemp', groups)
    if (!reading) {
      encoder.copyBufferToBuffer(buffers.V, 0, readPos, 0, vec2Bytes)
      encoder.copyBufferToBuffer(buffers.F, 0, readTemp, 0, f32Bytes)
      encoder.copyBufferToBuffer(buffers.F, 2 * f32Bytes, readPress, 0, f32Bytes)
      encoder.copyBufferToBuffer(buffers.V, 2 * vec2Bytes, readVel, 0, vec2Bytes)
    }
    device.pushErrorScope('validation')
    device.queue.submit([encoder.finish()])
    device.popErrorScope().then(e => { if (e && !warned) { warned = true; console.error('gpu validation', e.message) } })
    if (!reading) readBack()
    time += dt
  }

  return {
    step,
    state,
    get count () { return alive },
    setTouches (list) { touches = list || [] },
    // Finished with the GPU work queued so far (for timing).
    settled () { return device.queue.onSubmittedWorkDone() },
    // Read a buffer straight back, for poking from the console.
    async probe (buffer, offsetFloats = 0, floats = 8) {
      const src = buffers[buffer]
      const staging = device.createBuffer({ size: floats * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
      const enc = device.createCommandEncoder()
      enc.copyBufferToBuffer(src, offsetFloats * 4, staging, 0, floats * 4)
      device.queue.submit([enc.finish()])
      await staging.mapAsync(GPUMapMode.READ)
      const out = Array.from(new Float32Array(staging.getMappedRange()))
      staging.unmap(); staging.destroy()
      return out
    },
    gpu: true
  }
}
