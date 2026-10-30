// Double density relaxation, from Clavet, Beaudoin and Poulin, "Particle-based Viscoelastic Fluid
// Simulation" (SCA 2005), section 4, by way of Peeke Kuepers' JavaScript walkthrough at
// peeke.nl/simulating-blobs-of-fluid. Only this part of the paper is used: no springs and no
// viscosity impulses. The simulation never carries velocity between frames, so it is already as
// viscous as it can get.

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
