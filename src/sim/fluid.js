// Double density relaxation, from Clavet, Beaudoin and Poulin, "Particle-based Viscoelastic Fluid
// Simulation" (SCA 2005), section 4, by way of Peeke Kuepers' JavaScript walkthrough at
// peeke.nl/simulating-blobs-of-fluid. Sections 4 (relaxation) and 5.3 (viscosity impulses) are
// used; no springs. With Wobble at 0 the simulation never carries velocity between frames, so it
// is already as viscous as it can get and the impulses are skipped.

// Collect the particles within `radius` of particle i and store each one's kernel weight
// g = 1 - r/h in state.g, indexed by the neighbour. The weights are scratch space, valid only
// until the next particle is processed, and so is the array returned: it is the same array
// every call, emptied and refilled, which spares the garbage collector one array per particle
// per step (a measurable share of the step on a phone).
const neighbours = []
export function findNeighbours (state, hash, i, radius) {
  const candidates = hash.query(state.x[i], state.y[i], radius)
  const radiusSq = radius * radius
  const xi = state.x[i]
  const yi = state.y[i]
  neighbours.length = 0
  for (let k = 0; k < candidates.length; k++) {
    const n = candidates[k]
    if (n === i) continue
    const dx = xi - state.x[n]
    const dy = yi - state.y[n]
    const distSq = dx * dx + dy * dy
    if (distSq > radiusSq) continue
    const g = 1 - Math.sqrt(distSq) / radius
    if (g === 0) continue
    state.g[n] = g
    neighbours.push(n)
  }
  return neighbours
}

// Equations 1, 2, 4 and 5. Density uses the quadratic kernel, near density the cubic one.
// Pressure goes negative below the rest density, which is what pulls particles together and
// gives the blobs their surface tension.
export function updatePressure (state, i, neighbours, stiffness, stiffnessNear, restDensity) {
  let density = 0
  let nearDensity = 0
  for (let k = 0; k < neighbours.length; k++) {
    const g = state.g[neighbours[k]]
    density += g * g
    nearDensity += g * g * g
  }
  state.p[i] = stiffness * (density - restDensity)
  state.pNear[i] = stiffnessNear * nearDensity
}

// Equation 6: push or pull each neighbour along the line between the two particles.
// The paper splits the displacement half and half. Here particle i takes the whole step and the
// neighbour a tenth of it. That is a tuning choice, not an oversight: it is part of how the lamp moves.
// The direction is measured from where i was when its turn started, not where it has drifted to
// mid-loop, which is also how it was tuned.
// Particle i's own displacement is summed and, when `cap` is given, limited to that many px a
// step. The caller caps lava hidden in a reservoir (RELAX_CAP): packed deep under the weight of
// the pool and held in by the glass, it now and then crowds past its rest density and the
// pressure throws particles 40 to 70 px in one step (1.0% of hidden steps with the bottles,
// 0.5% with the shallow cups before them, none on a flat floor), which read as "huge jitter
// jumps". The visible pool is never capped: capping it kept the lava at the walls from relieving
// its pressure and it was extruded up the walls in a column (111 to 162 particles at the walls
// against 7 to 12).
export const RELAX_CAP = 20
export function relax (state, i, neighbours, dt, cap = Infinity) {
  const xi = state.x[i]
  const yi = state.y[i]
  const dtSq = dt * dt
  let sx = 0
  let sy = 0
  for (let k = 0; k < neighbours.length; k++) {
    const n = neighbours[k]
    const g = state.g[n]
    const magnitude = (state.p[i] * g + state.pNear[i] * g * g) * dtSq
    unitApprox(state.x[n] - xi, state.y[n] - yi)
    const dx = unit[0] * magnitude
    const dy = unit[1] * magnitude
    sx += dx
    sy += dy
    state.x[n] += dx * 0.1
    state.y[n] += dy * 0.1
  }
  const shift = Math.sqrt(sx * sx + sy * sy)
  if (shift > cap) {
    const scale = cap / shift
    sx *= scale
    sy *= scale
  }
  state.x[i] -= sx
  state.y[i] -= sy
}

// Section 5.3, the viscosity impulse: for each pair of neighbours approaching each other, an
// impulse along the line between them takes away part of that approach, `sigma` of it per
// second scaled by the kernel weight (linear term; the paper's quadratic term, for splashes, is
// left out). Only approach is damped, never separation, so a neck can be drawn out freely but
// thins more slowly and a parted tail retracts into its head more slowly: the video of a real lamp
// (docs/checkpoints/43b) has the neck thinning at 0.23 head widths per second and the tail taking
// 1.5 s to pull in, where the lab at Wobble 0.3 pinched two and a half times faster. Each pair is
// visited once (neighbours later in the array only), the factor is capped so a pair can at most
// stop approaching, and the two halves are equal and opposite, so momentum is kept and it cannot
// feed on itself the way easing velocities toward the neighbours' mean did (that blew up).
export function viscosity (state, i, neighbours, dt, sigma) {
  const xi = state.x[i]
  const yi = state.y[i]
  for (let k = 0; k < neighbours.length; k++) {
    const n = neighbours[k]
    if (n < i) continue
    const rx = state.x[n] - xi
    const ry = state.y[n] - yi
    const r = Math.sqrt(rx * rx + ry * ry)
    if (r === 0) continue
    const ux = rx / r
    const uy = ry / r
    // Approach speed: positive when i moves toward n faster than n moves away.
    const u = (state.vx[i] - state.vx[n]) * ux + (state.vy[i] - state.vy[n]) * uy
    if (u <= 0) continue
    const impulse = Math.min(1, dt * state.g[n] * sigma) * u * 0.5
    state.vx[i] -= impulse * ux
    state.vy[i] -= impulse * uy
    state.vx[n] += impulse * ux
    state.vy[n] += impulse * uy
  }
}

// Fast approximate unit vector, from Nick Vogt:
// https://www.h3xed.com/programming/fast-unit-vector-calculation-for-2d-games
// Written into `unit` rather than returned, to avoid an array per neighbour per step.
const unit = [0, 0]
function unitApprox (x, y) {
  if (x === 0 && y === 0) {
    unit[0] = 0
    unit[1] = 0
    return
  }
  const ax = Math.abs(x)
  const ay = Math.abs(y)
  let ratio = 1 / Math.max(ax, ay)
  ratio *= 1.29289 - (ax + ay) * ratio * 0.29289
  unit[0] = x * ratio
  unit[1] = y * ratio
}
