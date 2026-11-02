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
// Wall, viscosity, conduction and Settle. createGpuLamp adds the lamp's world: the stir and
// eddies, the heating elements and heat spots, and the bottles and pots (Robert: "the lava looks
// incredible the dynamics are amazing. we need to get the rest of the lavalamp working on gpu").
// The bottles are simulation.js's geometry, laid out and drawn on the CPU, uploaded as a table
// (the neck's numbers, the bulb's radius at 120 angles, the outline as a polygon) and enforced
// in the shader by the same rules: a particle past the lip or the floor line is locked to the
// bottle it entered through (its home), a stray is put back on the nearest point of its own
// bottle, and heat between bottles goes through glass. Positions and temperatures come back to
// the CPU each frame for the renderer (one frame late); drawing from the GPU's own buffers is
// the next step.
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

import { createSimulation, STIR_OVERRIDE } from './simulation.js'

const WORKGROUP = 64
const MAX_TOUCHES = 4
const FIXED = 64 // the mean density is summed in fixed point: integer atomics are all WGSL has
// The bottle table: 16 scalars (cx, lineY, dir, w, rm, rs, yf, neckEnd, cy, R, reach, then room),
// the bulb's radius at OUTLINE_POINTS angles, and the outline as OUTLINE_POINTS x,y pairs.
const OUTLINE_POINTS = 120
const BOTTLE_FLOATS = 16 + OUTLINE_POINTS * 3
const MAX_BOTTLES = 64
const GLASS_CONDUCTION = 0.3 // simulation.js
const RESERVE_COOLING = 0.3 // heat.js
const RELAX_CAP = 20 // fluid.js

export const SHADER = /* wgsl */`
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
  kickSmooth: f32,
  worldPower: f32,
  elementCount: u32,
  gridCols: u32,
  gridRows: u32,
  gridCell: f32,
  impulseX: f32,
  impulseY: f32,
  elementsAt: u32,
  flowAt: u32,
  ceilingBottles: u32,
  floorBottles: u32,
  relaxCap: f32,
  gridTop: f32,
  fingerOverride: f32,
  liftCap: f32,
  damp: f32,
  wallNear: f32,
  wallPull: f32,
}
struct Touch { x: f32, y: f32, vx: f32, vy: f32, mode: u32, pad0: u32, pad1: u32, pad2: u32 }
struct Touches { t: array<Touch, ${MAX_TOUCHES}> }

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<uniform> T: Touches;
@group(0) @binding(2) var<storage, read_write> V: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> F: array<f32>;
@group(0) @binding(4) var<storage, read_write> U: array<u32>;
@group(0) @binding(5) var<storage, read_write> A: array<atomic<u32>>;
// The lamp's world, sampled on the CPU each step: the heater's power per column of the floor
// (256 columns), the lit elements (x, radius, half width, heat times glow; 8 floats each), and
// the stirring (the convection roll and the eddies) on a grid, two floats a point.
@group(0) @binding(6) var<storage, read_write> WLD: array<f32>;
// The bottles: the ceiling's then the floor's, BOTTLE_FLOATS each (see bottleTable).
@group(0) @binding(7) var<storage, read_write> BOT: array<f32>;

fn POS(i: u32) -> u32 { return i; }
fn POSOUT(i: u32) -> u32 { return P.capacity + i; }
fn VEL(i: u32) -> u32 { return 2u * P.capacity + i; }
fn VELOUT(i: u32) -> u32 { return 3u * P.capacity + i; }
fn PX(i: u32) -> u32 { return 4u * P.capacity + i; }
fn DELTA(i: u32) -> u32 { return 5u * P.capacity + i; } // the particle's last relaxation move
fn TEMP(i: u32) -> u32 { return i; }
fn TEMPOUT(i: u32) -> u32 { return P.capacity + i; }
fn PRESS(i: u32) -> u32 { return 2u * P.capacity + i; }
fn NEAR(i: u32) -> u32 { return 3u * P.capacity + i; }
fn DENS(i: u32) -> u32 { return 4u * P.capacity + i; }
fn HOME(i: u32) -> u32 { return 5u * P.capacity + i; } // the bottle a hidden particle is in, as a float; -1 for none
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
fn cellY(y: f32) -> i32 { return clamp(i32(floor((y - P.gridTop) / P.cell)), 0, i32(P.rows) - 1); }
fn cellIndex(p: vec2f) -> u32 { return u32(cellX(p.x)) + u32(cellY(p.y)) * P.cols; }


// simulation.js's bottles. A bottle is a mouth of half width w in the line at lineY (the lip for
// the ceiling, the bottom edge for the floor), a neck to neckEnd in direction dir (-1 up, +1
// down) with fillets rm at the mouth and rs at the shoulder (yf), and a bulb centred at cy whose
// radius at a canvas angle is the table's, OUTLINE points around; the outline itself follows as
// a polygon, for putting a stray particle back on its nearest point.
const OUTLINE = ${OUTLINE_POINTS}u;
const BOTTLE = ${BOTTLE_FLOATS}u;
const RADII = 16u;
const POLY = ${16 + OUTLINE_POINTS}u;
const TAU = 6.2831853;
const GLASS = ${GLASS_CONDUCTION}; // conduction between bottles, a share of the usual
fn bf(b: u32, k: u32) -> f32 { return BOT[b * BOTTLE + k]; }
fn bRadius(b: u32, theta: f32) -> f32 {
  var a = theta / TAU; a -= floor(a);
  let f = a * f32(OUTLINE);
  let k = u32(f);
  let t = f - f32(k);
  return mix(bf(b, RADII + k), bf(b, RADII + (k + 1u) % OUTLINE), t);
}
fn neckHalf(b: u32, py: f32) -> f32 {
  let lineY = bf(b, 1u); let dir = bf(b, 2u); let w = bf(b, 3u); let rm = bf(b, 4u); let rs = bf(b, 5u); let yf = bf(b, 6u);
  let t = abs(py - lineY);
  var mouth = 0.0;
  if (t < rm) { mouth = rm - sqrt(max(0.0, rm * rm - (rm - t) * (rm - t))); }
  let u = (py - yf) * dir;
  var shoulder = 0.0;
  if (u > 0.0) { let m = min(u, rs); shoulder = rs - sqrt(max(0.0, rs * rs - m * m)); }
  return w + mouth + shoulder;
}
fn insideBottle(b: u32, p: vec2f) -> bool {
  let cx = bf(b, 0u); let lineY = bf(b, 1u); let dir = bf(b, 2u); let neckEnd = bf(b, 7u); let cy = bf(b, 8u); let reach = bf(b, 10u);
  let dx = p.x - cx;
  if ((p.y - neckEnd) * dir <= 0.0 && (p.y - lineY) * dir >= 0.0 && abs(dx) <= neckHalf(b, p.y)) { return true; }
  let dy = p.y - cy;
  let d2 = dx * dx + dy * dy;
  if (d2 > reach * reach) { return false; }
  let rr = bRadius(b, atan2(dy, dx));
  return d2 <= rr * rr;
}
// simulation.js containIn: keep a particle past the row's line inside one bottle of the row, the
// one it entered through (HOME), or hold it at the line under no mouth. Returns the position.
fn containIn(i: u32, p: vec2f, first: u32, count: u32) -> vec2f {
  let lineY = bf(first, 1u);
  let dir = bf(first, 2u);
  if ((p.y - lineY) * dir <= 0.0) { F[HOME(i)] = -1.0; return p; }
  var k = i32(F[HOME(i)]);
  if (k < i32(first) || k >= i32(first + count)) {
    k = -1;
    for (var j = first; j < first + count; j++) { if (insideBottle(j, p)) { k = i32(j); break; } }
    if (k < 0) { for (var j = first; j < first + count; j++) { if (abs(p.x - bf(j, 0u)) <= neckHalf(j, lineY)) { k = i32(j); break; } } }
    if (k < 0) { return vec2f(p.x, lineY); }
    F[HOME(i)] = f32(k);
  }
  let b = u32(k);
  if (insideBottle(b, p)) { return p; }
  let cx = bf(b, 0u); let w = bf(b, 3u); let rm = bf(b, 4u); let rs = bf(b, 5u); let yf = bf(b, 6u); let neckEnd = bf(b, 7u);
  let dx = p.x - cx;
  var bestD = abs(p.y - lineY);
  var best = vec2f(p.x, lineY);
  if ((p.y - neckEnd) * dir <= 0.0) {
    // In the neck's span but outside its walls: sideways to the wall, or out of a fillet along
    // its radius; past a fillet's square the lip, so the line or the bulb is the way back.
    let side = select(-1.0, 1.0, dx >= 0.0);
    let fromLine = abs(p.y - lineY);
    let pastShoulder = (p.y - yf) * dir;
    var n = vec2f(cx + side * w, p.y);
    var valid = true;
    var rc = 0.0;
    if (fromLine < rm) { rc = rm; } else if (pastShoulder > 0.0) { rc = rs; }
    if (rc > 0.0 && abs(dx) <= w + rc) {
      let cc = vec2f(cx + side * (w + rc), select(yf, lineY + dir * rm, fromLine < rm));
      let e = p - cc;
      let el = max(length(e), 1e-6);
      n = cc + e / el * rc;
      if (abs(n.x - cx) > w + rc + 0.01 || (n.y - lineY) * dir < -0.01 || (n.y - neckEnd) * dir > 0.01) { valid = false; }
    } else if (rc > 0.0 && abs(dx) > w + rc) {
      valid = false;
    }
    if (valid) { let d = distance(n, p); if (d < bestD) { bestD = d; best = n; } }
  }
  // The nearest point on the bulb's outline.
  for (var k2 = 0u; k2 < OUTLINE; k2++) {
    let a = vec2f(bf(b, POLY + k2 * 2u), bf(b, POLY + k2 * 2u + 1u));
    let k3 = (k2 + 1u) % OUTLINE;
    let c = vec2f(bf(b, POLY + k3 * 2u), bf(b, POLY + k3 * 2u + 1u));
    let e = c - a;
    let len2 = max(dot(e, e), 1e-6);
    let t = clamp(dot(p - a, e) / len2, 0.0, 1.0);
    let q = a + e * t;
    let d = distance(q, p);
    if (d < bestD) { bestD = d; best = q; }
  }
  return best;
}
// simulation.js contain, the position part: the side walls, then the floor's pots below the
// bottom edge and the ceiling's bottles above the lip (the lip is the top edge), or the flat
// box when there are none. Returns the position; the caller decides what the glass does to the
// velocity.
fn contain(i: u32, pIn: vec2f) -> vec2f {
  var p = pIn;
  p.x = clamp(p.x, 0.0, P.width);
  if (P.ceilingBottles + P.floorBottles > 0u) {
    if (p.y > P.height) {
      if (P.floorBottles > 0u) { p = containIn(i, p, P.ceilingBottles, P.floorBottles); } else { p.y = P.height; F[HOME(i)] = -1.0; }
    } else if (p.y < 0.0) {
      if (P.ceilingBottles > 0u) { p = containIn(i, p, 0u, P.ceilingBottles); } else { p.y = 0.0; F[HOME(i)] = -1.0; }
    } else { F[HOME(i)] = -1.0; }
  } else {
    p.y = clamp(p.y, 0.0, P.height);
  }
  return p;
}

// The floor heater's power under x: the lamp's, by column, when a world is sampled; else the
// lab's, a front from the middle while warming up, then full.
fn heaterPower(x: f32) -> f32 {
  if (P.worldPower > 0.5) { return WLD[u32(clamp(x / P.width * 256.0, 0.0, 255.0))]; }
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
  // Lava hidden in a pot below the floor cools at heat.js's RESERVE_COOLING: the base of a lamp
  // is glass over the bulb and holds its warmth.
  if (t > 0.0) { t -= skewedNormal(i, 1u, 0.25, 2.75, 1.8) * P.cooling * select(1.0, ${RESERVE_COOLING}, p.y > P.height); }
  let fromFloor = P.height - p.y;
  if (p.y > P.height * 0.8 && t < P.maxTemp) {
    let d = max(1.0, abs(fromFloor));
    let inc = skewedNormal(i, 3u, 0.0, 5.0, 1.0) / d * heaterPower(p.x);
    t += inc;
    if (abs(fromFloor) < P.size) { t += inc * inc; }
  }
  // The lit elements' heat in depth: a Gaussian over each element's radius, as simulation.js.
  for (var e = 0u; e < P.elementCount; e++) {
    let o = P.elementsAt + e * 8u;
    let ex = WLD[o]; let er = WLD[o + 1u]; let eh = WLD[o + 2u]; let heat = WLD[o + 3u];
    if (heat <= 0.0 || er <= 0.0 || eh <= 0.0) { continue; }
    let pot = WLD[o + 4u]; // the floor bottle this element is, as a HOME value, or -1
    if (F[HOME(i)] >= 0.0) {
      // Lava in a pot: its own element's heat in full, wherever it sits (simulation.js elementHeat).
      if (F[HOME(i)] == pot) { t = min(P.maxTemp, t + heat); }
      continue;
    }
    let dx = (p.x - ex) * er / eh;
    let d2 = (dx * dx + fromFloor * fromFloor) / (er * er);
    if (d2 < 4.0) { t = min(P.maxTemp, t + heat * exp(-d2)); }
  }
  // The stirring at this point, from the grid, bilinear: velocity and how much the eddies here
  // override the inertia (simulation.js overrideAt), three floats a point.
  var stir = vec2f(P.impulseX, P.impulseY);
  var stirred = 0.0; // how much the stirring here overrides the inertia (override is a WGSL keyword)
  if (P.gridCols > 1u && P.gridRows > 1u) {
    let gx = clamp(p.x / P.gridCell, 0.0, f32(P.gridCols - 1u) - 0.001);
    let gy = clamp(p.y / P.gridCell, 0.0, f32(P.gridRows - 1u) - 0.001);
    let x0 = u32(floor(gx)); let y0 = u32(floor(gy));
    let fx = gx - f32(x0); let fy = gy - f32(y0);
    let at = P.flowAt;
    let i00 = at + (x0 + y0 * P.gridCols) * 3u;
    let i10 = i00 + 3u;
    let i01 = i00 + P.gridCols * 3u;
    let i11 = i01 + 3u;
    let v00 = vec3f(WLD[i00], WLD[i00 + 1u], WLD[i00 + 2u]); let v10 = vec3f(WLD[i10], WLD[i10 + 1u], WLD[i10 + 2u]);
    let v01 = vec3f(WLD[i01], WLD[i01 + 1u], WLD[i01 + 2u]); let v11 = vec3f(WLD[i11], WLD[i11 + 1u], WLD[i11 + 2u]);
    let s = mix(mix(v00, v10, fx), mix(v01, v11, fx), fy);
    stir += s.xy;
    stirred = s.z;
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
    else { stirred = max(stirred, min(1.0, P.fingerOverride * w)); } // a moving finger overrides the inertia by its weight, simulation.js STIR_OVERRIDE.finger
    if (tc.mode == 0u) { let u = select(vec2f(0.0), d / r, r > 0.0); finger += (250.0 * u + vec2f(tc.vx, tc.vy)) * w; }
    else if (tc.mode == 1u) { if (r > 0.0) { let speed = min(250.0 * w, r / P.dt); finger += -d / r * speed + vec2f(tc.vx, tc.vy) * w; } }
    else if (tc.mode == 2u) { let core = P.touchRadius * 0.5; let c = r / core; let speed = 300.0 * 2.0 * c / (1.0 + c * c) * exp(-(q * q) / 4.0); if (r > 0.0) { finger += vec2f(-d.y, d.x) / r * speed + vec2f(tc.vx, tc.vy) * w; } }
  }
  t = clamp(t, 0.0, P.maxTemp);
  F[TEMP(i)] = t;
  // Lava in a bottle takes no stirring (simulation.js: the eddies packed the pots).
  if (F[HOME(i)] >= 0.0) { finger = vec2f(0.0); stir = vec2f(0.0); stirred = 0.0; }
  // Buoyancy goes through the inertia; the stirring (roll, eddies, fingers, impulse) moves the
  // lava at full strength this step, and under a finger or inside a strong eddy the carried
  // velocity gives way to the drift (no memory there), as simulation.js STIR_OVERRIDE.
  let drift = vec2f(0.0, max(P.gravity - t, -P.liftCap * P.gravity));
  var v = V[VEL(i)];
  if (P.wobble > 0.0) { v += (drift - v) * max(min(1.0, P.dt / P.wobble), stirred); } else { v = drift; }
  V[VEL(i)] = v;
  p += (v + finger + stir) * P.dt;
  // Kept inside the box here and after every relaxation pass, not only at the end of the step:
  // with the floor enforced once, each pass pushed the bottom row through it and back and 300
  // particles sat on the floor line (the CPU keeps 17), took the floor's contact heat, and the
  // pool warmed through warm up where the CPU's cooled; with it enforced every pass, 148, and the
  // warm up matches the CPU (mean temperature 340 against 345 at six seconds).
  p = contain(i, p);
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

// The glass as particles. The side walls used to be a clamp applied after the relaxation
// (contain): a particle against the wall was pushed into it by its neighbours every pass and
// put back, and with neighbours on one side only it was unsupported and one-sidedly pulled,
// so the wall layer sank and the band beside it rose, a cell at each wall that churned a
// still pool (measured 2026-11-02: 157 particles on the wall lines, each tried 1.5 px into the
// wall a pass; the band within 15 px jittered 14% of a spacing a step against 0 in the middle;
// Robert: "I bet we need a border of actual particles with a near setting. The particles need
// to form a solid boundary and can be constant, but should apply at the boundary instead of
// any kind of hard clamp"). So: a fixed lattice of boundary particles behind each side wall,
// one every spacing (a sixth of the radius) in rows half a spacing in from the wall, staggered,
// as deep as the radius. Lava within a radius of the wall counts them in its density and is
// pushed off them by its own near pressure (wallNear times) and pulled to them by its own
// pressure (wallPull times, 0 for a glass the lava does not wet); they push back with the
// lava's own pressures, as a neighbour of the same liquid would. The lattice is computed on the
// fly, nothing is stored, and only lava near a wall pays for it. wallNear 0 is off: the clamp
// alone, as before.
fn wallSpacing() -> f32 { return P.radius / 6.0; }
// Calls body(dv, g) for each lattice point within the radius of p: dv from p to the point.
fn wallLattice(p: vec2f, side: u32) -> bool {
  let dist = select(P.width - p.x, p.x, side == 0u);
  return P.wallNear > 0.0 && dist < P.radius;
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
  for (var side = 0u; side < 2u; side++) {
    if (!wallLattice(p, side)) { continue; }
    let s = wallSpacing();
    let rows = u32(ceil(P.radius / s));
    for (var r = 0u; r < rows; r++) {
      let wx = select(P.width + (f32(r) + 0.5) * s, -(f32(r) + 0.5) * s, side == 0u);
      let dx = wx - p.x;
      if (abs(dx) >= P.radius) { continue; }
      let span = sqrt(P.radius * P.radius - dx * dx);
      let off = select(0.0, 0.5 * s, (r & 1u) == 1u);
      let k0 = i32(floor((p.y - span - off) / s));
      let k1 = i32(ceil((p.y + span - off) / s));
      for (var k = k0; k <= k1; k++) {
        let rr = length(vec2f(dx, f32(k) * s + off - p.y));
        if (rr >= P.radius) { continue; }
        let g = 1.0 - rr / P.radius;
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
  // Every particle moves at once from the same snapshot, so two neighbours closing on each other
  // both take the whole step and cross; the sequential solver never does that. The move is scaled
  // by the Jacobi factor (under relaxation) and Settle passes make up the convergence. Reach caps
  // the whole move, the pushes received included: a particle's own move was capped and the pushes
  // were not, and where the heat finger packed lava past its density the near pressure spiked, a
  // hundred neighbours each pushed from the same snapshot, and the pool erupted into a spray
  // (Robert: "on the gpu, in pinch, with current settings, it sometimes randomly explodes").
  for (var side = 0u; side < 2u; side++) {
    if (!wallLattice(p, side)) { continue; }
    let s = wallSpacing();
    let rows = u32(ceil(P.radius / s));
    for (var r = 0u; r < rows; r++) {
      let wx = select(P.width + (f32(r) + 0.5) * s, -(f32(r) + 0.5) * s, side == 0u);
      let dx = wx - p.x;
      if (abs(dx) >= P.radius) { continue; }
      let span = sqrt(P.radius * P.radius - dx * dx);
      let off = select(0.0, 0.5 * s, (r & 1u) == 1u);
      let k0 = i32(floor((p.y - span - off) / s));
      let k1 = i32(ceil((p.y + span - off) / s));
      for (var k = k0; k <= k1; k++) {
        let dv = vec2f(dx, f32(k) * s + off - p.y);
        let rr = length(dv);
        if (rr >= P.radius || rr == 0.0) { continue; }
        let g = 1.0 - rr / P.radius;
        let u = dv / rr;
        let pair = (pi * g * P.wallPull + ni * g * g * P.wallNear) * dt2;
        own += u * pair;
        pushed -= u * pair * P.share;
      }
    }
  }
  var delta = (pushed - own) * P.jacobi; // WGSL reserves the word move
  // Every particle moving at once is a Jacobi iteration, unstable where the lava is packed: in
  // the cold floor at Near 1101 and Radius 25 each neighbour's reply undoes about seven times the
  // move, so the pool never settles, the Reach cap sets how far the oscillation swings (6 px in a
  // lattice 3.6 px apart) and it comes out as rings around holes, the honeycomb (Robert,
  // 2026-11-01: "it just ruins the effect"). Damping every move, or capping it near the spacing,
  // stopped the rings and also stopped the pool flowing: hot lava could no longer push through
  // the packed lava above it and the pool lifted off as a slab. The oscillation is the only part
  // that reverses every pass, so a move that reverses the particle's previous one is taken at
  // damp of its length and a move that continues it is taken whole: the rings lose their swing,
  // a particle pushing through, a neck drawing, a skin pulling in, all keep theirs. damp 1 is off.
  let prev = V[DELTA(i)];
  if (P.damp < 1.0 && dot(delta, prev) < 0.0) { delta *= P.damp; }
  // Lava hidden in a bottle is capped at fluid.js's RELAX_CAP as well, as simulation.js does.
  var cap = P.reach * P.radius;
  if (F[HOME(i)] >= 0.0) { cap = min(cap, P.relaxCap); }
  cap *= P.jacobi;
  let shift = length(delta);
  if (shift > cap) { delta *= cap / shift; }
  V[DELTA(i)] = delta;
  let q0 = p + delta;
  let q = contain(i, q0);
  // Glass takes the momentum carried into it, as the side walls do in kick: the part of the
  // velocity pointing into the bottle wall that just pushed the particle back goes. Only the
  // bottles do this; the flat floor and ceiling of the box are left as they were tuned.
  if (q0.y > P.height || q0.y < 0.0) {
    let n = q - q0;
    let nl = length(n);
    if (nl > 1e-4) {
      let u = n / nl;
      var v = V[VEL(i)];
      let into = dot(v, u);
      if (into < 0.0) { v -= into * u; V[VEL(i)] = v; }
    }
  }
  V[POSOUT(i)] = q;
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
    var delta = p - V[PX(i)];
    if (P.kickSmooth > 0.5) {
      // The move averaged over the neighbourhood. Every particle moving at once leaves a
      // checkerboard of small opposite moves between neighbours that the sequential solver never
      // has; those cancel in the average, and the real motion, a neck's recoil, a blob's skin
      // pulled in, is the same across a neighbourhood and survives. Kicking the raw move launched
      // the whole pool to the ceiling in the first second (1668 px/s at the lab's 3050, with the
      // heater off; the CPU 129).
      var sum = delta;
      var weight = 1.0;
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
            sum += g * (V[POS(j)] - V[PX(j)]);
            weight += g;
          }
        }
      }
      delta = sum / weight;
    }
    v += delta / P.dt * P.kick * P.jacobi;
    let speed = length(v);
    let limit = P.cap * P.gravity;
    if (speed > limit) { v *= limit / speed; }
  }
  // Walls take the momentum carried into them; the Wall margin eases lava off them.
  if (p.x < 0.0) { p.x = 0.0; v.x = max(v.x, 0.0); } else if (p.x > P.width) { p.x = P.width; v.x = min(v.x, 0.0); }
  if (P.wallPush > 0.0) {
    if (p.x < P.wallPush) { v.x += (P.wallPush - p.x) * 2.0; } else if (p.x > P.width - P.wallPush) { v.x -= (p.x - (P.width - P.wallPush)) * 2.0; }
  }
  // The floor and ceiling (and the bottles past them) were enforced by contain in the relaxation
  // passes, and the position has not moved since.
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
  let home = F[HOME(i)];
  for (var yy = max(cy - 1, 0); yy <= min(cy + 1, i32(P.rows) - 1); yy++) {
    for (var xx = max(cx - 1, 0); xx <= min(cx + 1, i32(P.cols) - 1); xx++) {
      let c = u32(xx) + u32(yy) * P.cols;
      let end = U[CELLSTART(c + 1u)];
      for (var k = U[CELLSTART(c)]; k < end; k++) {
        let j = U[SORTED(k)];
        if (j == i) { continue; }
        let r = length(V[POS(j)] - p);
        if (r >= P.radius) { continue; }
        var g = 1.0 - r / P.radius;
        // Heat crossing from one bottle to another goes through glass (simulation.js GLASS_CONDUCTION).
        let other = F[HOME(j)];
        if (home >= 0.0 && other >= 0.0 && other != home) { g *= GLASS; }
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
const PARAM_FLOATS = 52 // the Params struct, 52 fields, 208 bytes (a uniform's size is a multiple of 16)
// The most a relaxation pass may move a particle, in radii, whatever Reach says. The Jacobi
// solver resolves a packed cold pool only a few rows a pass, and moves of a whole radius let the
// floor compress and burst (the GPU's Reach default has been 0.5 since that was measured, 979 to
// 0 particles over 700 px/s) or, milder, settle into a honeycomb of rings in the coldest lava
// (Robert, 2026-11-01: "getting this weird emergent pattern... can we not add a guard for that to
// prevent it in code?"). His saved settings carried the CPU's Reach 1 onto the GPU once saves
// loaded after the backend was known, and the honeycomb followed within minutes.
const REACH_CAP = 0.5 // the honeycomb itself formed at 0.5 as well; see docs/decisions.md, 2026-11-01
const POWER_COLUMNS = 256
const MAX_ELEMENTS = 32
const ELEMENTS_AT = POWER_COLUMNS
const FLOW_AT = POWER_COLUMNS + MAX_ELEMENTS * 8
const FLOW_CELL = 24 // px between stirring samples
const MAX_FLOW_POINTS = 16384
const WORLD_FLOATS = FLOW_AT + MAX_FLOW_POINTS * 3 // vx, vy, override a point

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

export function createGpuSimulation ({ device, width: width0, height: height0, params, random = Math.random, onLost = null }) {
  // The browser can take the device away at any time (its GPU process restarts, the machine
  // sleeps, a driver resets): every call on it then fails, and a step kept running on it
  // threw "Instance dropped in popErrorScope" sixty times a second until the tab was closed
  // (Robert: "I experienced a crash on my mac"). Once lost, step does nothing and whoever
  // created the lamp is told once, with the browser's reason.
  let lost = null
  device.lost.then(info => {
    lost = info
    console.error('gpu device lost:', info.reason, info.message)
    if (onLost) onLost(info)
  })
  let width = width0
  let height = height0
  // Room for params.capacity particles if given (the lamp passes its GPU budget: the count follows
  // the window and can grow after the sim is made), else the count at creation.
  const capacity = Math.max(64, Math.ceil(Math.max(params.particleCount, params.capacity || 0) / WORKGROUP) * WORKGROUP)
  let alive = 0
  let time = 0
  let heaterTime = 0
  let frame = 0
  let touches = []
  let world = null // set by createGpuLamp: { elementCount, gridCols, gridRows, gridCell }
  const impulse = [0, 0]
  const state = {
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    temp: new Float32Array(capacity),
    p: new Float32Array(capacity),
    vx: new Float32Array(capacity),
    vy: new Float32Array(capacity),
    home: new Float32Array(capacity).fill(-1), // the bottle a particle was spawned in; the GPU keeps the live one
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
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
    ]
  })
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] })
  const pipelines = {}
  for (const name of entries) pipelines[name] = device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: name } })

  const storage = (size) => device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST })
  const vec2Bytes = capacity * 8
  const f32Bytes = capacity * 4
  let cell = Math.max(4, params.interactionRadius)
  // The grid covers the lamp and its bottles: from gridTop (the top of the highest bulb, 0 with
  // no bottles) to the bottom of the deepest pot. Clamping the hidden lava into the edge rows
  // instead would put a pot's thousands of particles in one row of cells.
  let gridTop = 0
  let gridBottom = height
  let cols = Math.ceil(width / cell) + 1
  let rows = Math.ceil((gridBottom - gridTop) / cell) + 1
  let cellCap = Math.max(cols * rows + 1, 64)
  const buffers = {
    params: device.createBuffer({ size: PARAM_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
    touches: device.createBuffer({ size: MAX_TOUCHES * 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
    V: storage(6 * vec2Bytes), // pos, posOut, vel, velOut, px, delta
    F: storage(6 * f32Bytes), // temp, tempOut, press, pressNear, dens, home
    U: null, // cellOf, sorted, cellStart (sized with the grid)
    A: null, // cellCount, mean accumulator
    WLD: storage(WORLD_FLOATS * 4), // the lamp's world, see createGpuLamp
    BOT: storage(MAX_BOTTLES * BOTTLE_FLOATS * 4) // the bottles, see setBottles
  }
  const sizeGrid = () => { buffers.U = storage((2 * capacity + cellCap) * 4); buffers.A = storage((cellCap + 1) * 4) }
  sizeGrid()
  device.queue.writeBuffer(buffers.F, 5 * f32Bytes, new Float32Array(capacity).fill(-1)) // home: none
  // Two sets of staging buffers for the readback: one may be mapped (being read) while the other
  // takes the next frame's copy, so the state the CPU sees is at most a frame old. With one set,
  // every frame while a map was pending went uncopied, and a harness stepping sixty frames in one
  // go then read the state from the first of them.
  const staging = [0, 1].map(() => ({ pos: device.createBuffer({ size: vec2Bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), temp: device.createBuffer({ size: f32Bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), press: device.createBuffer({ size: f32Bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), vel: device.createBuffer({ size: vec2Bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), busy: false }))
  let bindGroup = makeBindGroup()
  function makeBindGroup () {
    const order = ['params', 'touches', 'V', 'F', 'U', 'A', 'WLD', 'BOT']
    return device.createBindGroup({ layout, entries: order.map((name, binding) => ({ binding, resource: { buffer: buffers[name] } })) })
  }
  function layoutGrid () {
    cols = Math.ceil(width / cell) + 1
    rows = Math.ceil((gridBottom - gridTop) / cell) + 1
    const needed = cols * rows + 1
    if (needed > cellCap) {
      cellCap = needed
      buffers.U.destroy()
      buffers.A.destroy()
      sizeGrid()
      bindGroup = makeBindGroup()
    }
  }
  function fitGrid () {
    const want = Math.max(4, params.interactionRadius)
    if (want === cell) return
    cell = want
    layoutGrid()
  }

  // The bottles, from simulation.js's lists (bottles() and floorBottles()): the ceiling's then
  // the floor's, as a table the shader reads (see BOTTLE_FLOATS). The floor's pots are also where
  // the reserve spawns, and how much of it there is.
  let ceiling = []
  let floor = []
  let reserve = 0 // particles the pots hold between them, on top of params.particleCount
  const areaOf = b => {
    let sum = 0
    const n = 72
    for (let k = 0; k < n; k++) { const rr = b.radiusAt(k / n * Math.PI * 2); sum += rr * rr }
    return Math.PI * sum / n + 2 * b.w * Math.abs(b.neckEnd - b.lineY)
  }
  function setBottles (ceilingList, floorList) {
    ceiling = (ceilingList || []).slice(0, MAX_BOTTLES)
    floor = (floorList || []).slice(0, MAX_BOTTLES - ceiling.length)
    const table = new Float32Array(MAX_BOTTLES * BOTTLE_FLOATS)
    let top = 0
    let bottom = height
    ceiling.concat(floor).forEach((b, n) => {
      const o = n * BOTTLE_FLOATS
      table[o] = b.cx; table[o + 1] = b.lineY; table[o + 2] = b.dir; table[o + 3] = b.w; table[o + 4] = b.rm; table[o + 5] = b.rs
      table[o + 6] = b.yf; table[o + 7] = b.neckEnd; table[o + 8] = b.cy; table[o + 9] = b.R; table[o + 10] = b.reach
      for (let k = 0; k < OUTLINE_POINTS; k++) table[o + 16 + k] = b.radiusAt(k / OUTLINE_POINTS * Math.PI * 2)
      table.set(b.outline.subarray(0, OUTLINE_POINTS * 2), o + 16 + OUTLINE_POINTS)
      if (b.dir < 0) top = Math.min(top, b.cy - b.reach); else bottom = Math.max(bottom, b.cy + b.reach)
    })
    device.queue.writeBuffer(buffers.BOT, 0, table)
    let area = 0
    for (const b of floor) area += areaOf(b) * (b.cx <= 0 || b.cx >= width ? 0.5 : 1)
    reserve = Math.round(area / (params.spawnArea || 400))
    if (top !== gridTop || bottom !== gridBottom) { gridTop = top; gridBottom = bottom; layoutGrid() }
  }

  // The lava arrives as a warm slab on the floor, as simulation.js spawns it, with the pots'
  // worth inside the pots first (a pot picked by area, a point picked uniformly inside it).
  function fill (target) {
    target = Math.min(capacity, target)
    if (target <= alive) { alive = target; return }
    const spawnArea = params.spawnArea || 400
    const hidden = Math.max(0, Math.min(target, reserve) - alive)
    const depth = Math.max(0, spawnArea * (target - Math.min(target, reserve)) / width)
    const xs = new Float32Array(2 * capacity)
    const ts = new Float32Array(capacity)
    const homes = new Float32Array(capacity).fill(-1)
    for (let i = 0; i < alive; i++) { xs[2 * i] = state.x[i]; xs[2 * i + 1] = state.y[i]; ts[i] = state.temp[i]; homes[i] = state.home[i] }
    const areas = floor.map(areaOf)
    const total = areas.reduce((a, b) => a + b, 0)
    for (let i = alive; i < target; i++) {
      let x = random() * width
      let y = (height - depth) + random() * depth // the same draws as simulation.js's spawn, so a seed gives both the same slab
      if (i - alive < hidden && floor.length) {
        let pick = random() * total
        let k = floor.length - 1
        for (let j = 0; j < floor.length; j++) { pick -= areas[j]; if (pick <= 0) { k = j; break } }
        const b = floor[k]
        const bulb = areas[k] - 2 * b.w * Math.abs(b.neckEnd - b.lineY)
        for (let tries = 0; tries < 50; tries++) {
          let px, py
          if (random() * areas[k] < bulb) {
            px = b.cx + (random() * 2 - 1) * b.reach
            py = b.cy + (random() * 2 - 1) * b.reach
            const rr = b.radiusAt(Math.atan2(py - b.cy, px - b.cx))
            if ((px - b.cx) ** 2 + (py - b.cy) ** 2 > rr * rr) continue
          } else {
            px = b.cx + (random() * 2 - 1) * b.w
            py = b.lineY + random() * (b.neckEnd - b.lineY)
          }
          if (px < 0 || px > width) continue
          x = px; y = py
          homes[i] = ceiling.length + k
          break
        }
      }
      xs[2 * i] = x; xs[2 * i + 1] = y
      ts[i] = 0.8 * params.gravity
      state.x[i] = x; state.y[i] = y; state.temp[i] = ts[i]; state.home[i] = homes[i]
    }
    alive = target
    device.queue.writeBuffer(buffers.V, 0, xs) // pos
    device.queue.writeBuffer(buffers.V, 4 * vec2Bytes, xs) // px
    device.queue.writeBuffer(buffers.V, 2 * vec2Bytes, new Float32Array(2 * capacity)) // vel
    device.queue.writeBuffer(buffers.F, 0, ts) // temp
    device.queue.writeBuffer(buffers.F, 5 * f32Bytes, homes) // home
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
    pf[20] = Math.min(REACH_CAP, Number.isFinite(reach) ? reach : 1e9); pf[21] = kickBelow; pf[22] = wallPush; pf[23] = share
    pf[24] = heater ? 1 : 0; pf[25] = Math.min(1, heaterTime / 2); pf[26] = touchHeat
    pf[27] = touchRadius > 0 ? touchRadius : Math.max(80, 0.12 * Math.min(width, height))
    pf[28] = height / 1000 // cooling scale, heat.js REFERENCE_HEIGHT
    pu[29] = Math.min(MAX_TOUCHES, touches.length)
    pu[30] = capacity
    pu[31] = cellCap
    pf[32] = params.jacobi ?? 0.5 // the relaxation move scale per pass; see settle in step
    pf[33] = params.kickSmooth ?? 1
    pf[34] = world ? 1 : 0
    pu[35] = world ? world.elementCount : 0
    pu[36] = world ? world.gridCols : 0
    pu[37] = world ? world.gridRows : 0
    pf[38] = world ? world.gridCell : 1
    pf[39] = impulse[0]; pf[40] = impulse[1]
    pu[41] = ELEMENTS_AT
    pu[42] = FLOW_AT
    pu[43] = ceiling.length
    pu[44] = floor.length
    pf[45] = RELAX_CAP
    pf[46] = gridTop
    pf[47] = STIR_OVERRIDE.finger
    pf[48] = params.liftCap > 0 ? params.liftCap : 10
    pf[49] = params.damp ?? 0.25 // what is left of a relaxation move that reverses the last one; see relax
    pf[50] = params.wallNear ?? 0; pf[51] = params.wallPull ?? 0 // the glass as particles; see wallLattice
    impulse[0] = 0; impulse[1] = 0
    device.queue.writeBuffer(buffers.params, 0, paramData)
    for (let k = 0; k < MAX_TOUCHES; k++) {
      const t = touches[k]
      const o = k * 8
      tf[o] = t ? t.x : 0; tf[o + 1] = t ? t.y : 0; tf[o + 2] = t ? t.vx || 0 : 0; tf[o + 3] = t ? t.vy || 0 : 0
      tu[o + 4] = t ? (TOUCH_MODES[t.mode] ?? 0) : 0
    }
    device.queue.writeBuffer(buffers.touches, 0, touchData)
  }

  let warned = false
  let reads = 0 // readbacks landed, for debugging
  async function readBack (set) {
    set.busy = true
    try {
      await Promise.all([set.pos.mapAsync(GPUMapMode.READ), set.temp.mapAsync(GPUMapMode.READ), set.press.mapAsync(GPUMapMode.READ), set.vel.mapAsync(GPUMapMode.READ)])
      const xy = new Float32Array(set.pos.getMappedRange())
      const t = new Float32Array(set.temp.getMappedRange())
      const pr = new Float32Array(set.press.getMappedRange())
      const v = new Float32Array(set.vel.getMappedRange())
      const n = alive
      for (let i = 0; i < n; i++) { state.x[i] = xy[2 * i]; state.y[i] = xy[2 * i + 1]; state.vx[i] = v[2 * i]; state.vy[i] = v[2 * i + 1] }
      state.temp.set(t.subarray(0, n))
      state.p.set(pr.subarray(0, n))
      set.pos.unmap(); set.temp.unmap(); set.press.unmap(); set.vel.unmap()
      reads++
    } catch (err) {
      if (!warned) { warned = true; console.warn('gpu readback', err) }
    }
    set.busy = false
  }

  function step (dt) {
    if (lost) return
    const target = Math.min(capacity, Math.trunc(params.particleCount) + reserve)
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
    const set = staging.find(s => !s.busy)
    if (set) {
      encoder.copyBufferToBuffer(buffers.V, 0, set.pos, 0, vec2Bytes)
      encoder.copyBufferToBuffer(buffers.F, 0, set.temp, 0, f32Bytes)
      encoder.copyBufferToBuffer(buffers.F, 2 * f32Bytes, set.press, 0, f32Bytes)
      encoder.copyBufferToBuffer(buffers.V, 2 * vec2Bytes, set.vel, 0, vec2Bytes)
    }
    device.pushErrorScope('validation')
    device.queue.submit([encoder.finish()])
    device.popErrorScope().then(e => { if (e && !warned) { warned = true; console.error('gpu validation', e.message) } }).catch(() => {}) // rejects once the device is lost
    if (set) readBack(set)
    time += dt
  }

  return {
    step,
    state,
    get count () { return alive },
    setTouches (list) { touches = list || [] },
    push (fx, fy) { impulse[0] += fx; impulse[1] += fy },
    // The world's samples for the next step: power columns, elements, flow grid (Float32Array).
    setWorld (floats, info) { world = info; device.queue.writeBuffer(buffers.WLD, 0, floats) },
    resize (w, h) { width = w; height = h; if (!floor.length) gridBottom = h; layoutGrid() },
    setBottles,
    get reserve () { return reserve },
    // Everything at rest: temperature, velocity, the kick's previous position and the damping's
    // last move all zeroed, so a still test starts from a lava with nothing in it but position
    // (Robert, 2026-11-02: "start with a non-moving lava and then zero out everything's temp,
    // velocity, momentum, etc"). The next readback brings the zeros into state.
    calm () {
      const zeros2 = new Float32Array(2 * capacity)
      device.queue.writeBuffer(buffers.F, 0, new Float32Array(2 * capacity)) // temp, tempOut
      device.queue.writeBuffer(buffers.V, 2 * vec2Bytes, zeros2) // vel, velOut (two vec2 arrays)
      device.queue.writeBuffer(buffers.V, 5 * vec2Bytes, new Float32Array(2 * capacity).subarray(0, 2 * capacity)) // delta
      const xs = new Float32Array(2 * capacity)
      for (let i = 0; i < alive; i++) { xs[2 * i] = state.x[i]; xs[2 * i + 1] = state.y[i] }
      device.queue.writeBuffer(buffers.V, 4 * vec2Bytes, xs) // px = pos, so the kick sees no move
      state.temp.fill(0); state.vx.fill(0); state.vy.fill(0)
    },
    // Move every particle by fn(x, y) (the lamp turning with the phone), from the last readback.
    transform (fn) { const xs = new Float32Array(2 * capacity); for (let i = 0; i < alive; i++) { const [nx, ny] = fn(state.x[i], state.y[i]); state.x[i] = nx; state.y[i] = ny; xs[2 * i] = nx; xs[2 * i + 1] = ny } device.queue.writeBuffer(buffers.V, 0, xs); device.queue.writeBuffer(buffers.V, 4 * vec2Bytes, xs) },
    get width () { return width },
    get height () { return height },
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
    debug () { return { warned, reads, alive, capacity } },
    gpu: true
  }
}

// The lamp on the GPU: the particles in createGpuSimulation, the world (the heater's front and
// its elements and heat spots, the convection roll, the eddies) in a simulation.js with no
// particles, stepped alongside and sampled onto the GPU each frame: the heater's power per
// column of the floor, the lit elements, and the stirring on a grid FLOW_CELL px apart. The
// shell also lays out the bottles and pots, which go up as a table whenever they change (a
// resize, the Bottles knob); the shell itself holds no lava (worldOnly), so its reservoirs do not
// fill with CPU particles.
export function createGpuLamp ({ device, width, height, params, onLost }) {
  const shellParams = new Proxy(params, { get (t, k) { if (k === 'particleCount') return 0; if (k === 'worldOnly') return true; return t[k] } })
  const shell = createSimulation({ width, height, params: shellParams })
  const gpu = createGpuSimulation({ device, width, height, params, onLost })
  const floats = new Float32Array(WORLD_FLOATS)
  let bottlesSeen = null
  let potsSeen = null
  function sample () {
    const w = gpu.width
    const h = gpu.height
    const bottles = shell.bottles()
    const pots = shell.floorBottles()
    if (bottles !== bottlesSeen || pots !== potsSeen) { bottlesSeen = bottles; potsSeen = pots; gpu.setBottles(bottles, pots) }
    for (let c = 0; c < POWER_COLUMNS; c++) floats[c] = shell.heaterAt((c + 0.5) / POWER_COLUMNS * w)
    const elements = shell.heaterElements()
    let n = 0
    for (const el of elements) {
      if (n >= MAX_ELEMENTS || !(el.glow > 0) || !(el.heat > 0)) continue
      const o = ELEMENTS_AT + n * 8
      floats[o] = el.x; floats[o + 1] = el.radius; floats[o + 2] = el.halfWidth; floats[o + 3] = el.heat * el.glow
      floats[o + 4] = el.pot >= 0 ? bottles.length + el.pot : -1 // HOME counts the ceiling bottles first
      n++
    }
    let gridCols = Math.floor(w / FLOW_CELL) + 2
    let gridRows = Math.floor(h / FLOW_CELL) + 2
    let gridCell = FLOW_CELL
    while (gridCols * gridRows > MAX_FLOW_POINTS) { gridCell *= 1.5; gridCols = Math.floor(w / gridCell) + 2; gridRows = Math.floor(h / gridCell) + 2 }
    const stirring = (params.stir || 0) !== 0 || (params.turbulence || 0) !== 0
    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        const o = FLOW_AT + (gx + gy * gridCols) * 3
        if (stirring) { const [vx, vy] = shell.flowAt(gx * gridCell, gy * gridCell); floats[o] = vx; floats[o + 1] = vy; floats[o + 2] = shell.overrideAt(gx * gridCell, gy * gridCell) } else { floats[o] = 0; floats[o + 1] = 0; floats[o + 2] = 0 }
      }
    }
    gpu.setWorld(floats, { elementCount: n, gridCols, gridRows, gridCell })
  }
  // The fingers act on the GPU side, so the shell steps and is sampled without them (they would
  // land twice through the flow grid); they are given back to it after, so the flow field drawn
  // from shell.flowAt shows them, as the CPU lamp's does.
  let fingers = []
  return {
    step (dt) {
      shell.setTouches([])
      shell.step(dt)
      sample()
      gpu.step(dt)
      shell.setTouches(fingers)
    },
    resize (w, h) { shell.resize(w, h); gpu.resize(w, h) },
    push: gpu.push,
    setTouches (list) { fingers = list || []; gpu.setTouches(fingers) },
    transform: gpu.transform,
    flowAt: shell.flowAt,
    heaterAt: shell.heaterAt,
    heaterElements: shell.heaterElements,
    ceilingAt: shell.ceilingAt,
    floorAt: shell.floorAt,
    bottles: shell.bottles,
    floorBottles: shell.floorBottles,
    core: gpu, // the particle simulation itself, for poking from the console
    get state () { return gpu.state },
    get count () { return gpu.count },
    get width () { return gpu.width },
    get height () { return gpu.height },
    gpu: true
  }
}
