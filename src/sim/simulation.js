import { SpatialHash } from './spatialHash.js'
import { findNeighbours, relax, updatePressure } from './fluid.js'
import { nextTemperature, warmupTemperature } from './heat.js'
import { randomBetween } from './random.js'

const CELL_SIZE = 50
// How the lava arrives on load. All of this was tuned by measuring relaxation jitter (px per frame
// of movement that is not advection) against the steady state lamp, which sits around 1.2.
//
// Particles ooze up out of the middle OOZE_WIDTH of the floor at OOZE_RATE per second. A single
// point inlet was tried first: pressure shoved the puddle out to both walls into the same U shape.
const OOZE_RATE = 30
const OOZE_WIDTH = 0.25
// They arrive warm, at this fraction of gravity. Cold lava falls at full gravity into the stack
// every frame and pressure has to push it back apart, which jitters at 5x the steady state and
// reads as anxious. At 0.8 the stack is calm (1.6).
const OOZE_HEAT = 0.8
// A fresh particle stays anchored this many frames so the puddle moves out of its way instead of
// the particle being kicked out of the puddle. Takes the fill from 2.8 down to the settled 1.7.
const OOZE_SETTLE_FRAMES = 60
// After the fill the heat starts in the middle of the floor and spreads to the walls over WARMUP
// seconds, like a coil warming the base from the centre out. The floor outside the front still
// gets IDLE_HEAT, enough to hold the lava warm (heating roughly balances cooling near 0.3) but
// not enough to lift it. A flat warm up only delayed the explosion: every floor particle heats
// at the same rate from the same place, so they all cross buoyancy within the same second.
const WARMUP = 45
const IDLE_HEAT = 0.35
// During warm up the heat reaches WARMUP_DEPTH particle sizes up into the slab, flat all the way
// up (shape 0). Contact heating only warms the bottom layer, and hot bottom particles pop through
// the cold layers above as droplets; a linear falloff still let the bottom of the bulge escape
// first and it vented droplets. Flat heating takes a whole column buoyant together so the first
// thing to lift is one big glob. Measured by the clusters among lifted particles: contact only
// sent 60 up within a second in clusters of 7; linear depth 5 gain 1 gave 21 and 15 over ten
// seconds; flat depth 4 gain 0.6 gave 17 at 27 s and 48 at 31 s with little else. Gain 0.4 took
// a minute, gain 1 went back to many small globs.
const WARMUP_DEPTH = 4
const WARMUP_GAIN = 0.6
const WARMUP_SHAPE = 0

// The whole simulation, with no knowledge of the DOM, settings or rendering.
// `params` is a plain object the caller keeps up to date:
//   particleCount, interactionRadius, stiffness, stiffnessNear, restDensity, maxTemp, gravity, particleSize, stir
export function createSimulation ({ width, height, params }) {
  const hash = new SpatialHash(width, height, CELL_SIZE)
  const impulse = [0, 0]
  let state = allocate(params.particleCount)
  // Particles are not all alive at once. They ooze up out of the middle of the floor until the
  // count is reached, and ooze again whenever the count is raised. The heater comes on when the
  // first fill is done.
  let alive = 0
  let pending = 0
  let heater = false
  let heaterTime = 0
  let frame = 0
  let born = new Int32Array(params.particleCount) // frame each particle appeared

  function allocate (count) {
    return {
      x: new Float32Array(count),
      y: new Float32Array(count),
      vx: new Float32Array(count),
      vy: new Float32Array(count),
      temp: new Float32Array(count),
      p: new Float32Array(count), // pressure
      pNear: new Float32Array(count), // near pressure
      g: new Float32Array(count) // kernel weight scratch space, indexed by neighbour
    }
  }

  function spawn (i) {
    const span = width * OOZE_WIDTH
    state.x[i] = randomBetween((width - span) / 2, (width + span) / 2)
    state.y[i] = height
    state.vx[i] = 0
    state.vy[i] = 0
    state.temp[i] = OOZE_HEAT * params.gravity
    born[i] = frame
  }

  // Make room for more particles. Existing particles keep their state. The arrays never shrink;
  // a step just stops at the number alive.
  function ensureCapacity (count) {
    if (count <= state.x.length) return
    const grown = allocate(count)
    for (const field of Object.keys(state)) grown[field].set(state[field])
    state = grown
    const grownBorn = new Int32Array(count)
    grownBorn.set(born)
    born = grownBorn
  }

  // Bring the live count toward the target, a few particles per frame.
  function pour (target, dt) {
    if (alive > target) alive = target
    if (alive === target) {
      pending = 0
      heater = true
      return
    }
    heaterTime = 0
    pending += OOZE_RATE * dt
    while (pending >= 1 && alive < target) {
      spawn(alive++)
      pending -= 1
    }
  }

  function resize (newWidth, newHeight) {
    width = newWidth
    height = newHeight
    hash.resize(width, height)
  }

  // A one-frame shove to every particle, consumed by the next step. Used for device motion.
  function push (fx, fy) {
    impulse[0] += fx
    impulse[1] += fy
  }

  function step (dt) {
    const { particleCount, interactionRadius, stiffness, stiffnessNear, restDensity, maxTemp, gravity, particleSize, stir = 0 } = params
    frame++
    ensureCapacity(particleCount)
    pour(particleCount, dt)
    // Warm up: the heat starts in the middle of the floor and spreads to the walls over `warmup`
    // seconds, like a coil warming the base from the centre out, so the first glob lifts from the
    // middle and the rest follow instead of the whole cold puddle exploding at once.
    let progress = 1
    if (heater) {
      heaterTime += dt
      progress = Math.min(1, heaterTime / WARMUP)
    }
    const halfWidth = width / 2
    const powerAt = x => {
      if (progress >= 1) return 1
      const r = Math.abs(x - halfWidth) / halfWidth
      const p = (progress * 1.2 - r) / 0.2
      return p < IDLE_HEAT ? IDLE_HEAT : p > 1 ? 1 : p
    }
    const { x, y, vx, vy, temp } = state
    const fx = impulse[0]
    const fy = impulse[1]
    impulse[0] = 0
    impulse[1] = 0
    // The stir is a slow convection roll, the shape of the circulation in a real lamp: up the
    // middle, out along the top, down the walls and back in along the floor. `stir` is its peak
    // speed in pixels per second; negative runs it backwards. The field is divergence free with no
    // flow into any wall (stream function sin(2 pi x / w) sin(pi y / h)), so it moves the lava
    // around without squashing it or piling it up anywhere. It is the only thing in the model with
    // a sideways component, so it is what stops blobs rising and falling in the same lane forever.
    const kx = 2 * Math.PI / width
    const ky = Math.PI / height
    const vertical = 2 * stir * height / width

    hash.clear()
    for (let i = 0; i < alive; i++) {
      if (heater) {
        temp[i] = progress < 1
          ? warmupTemperature(temp[i], y[i], height, maxTemp, particleSize, powerAt(x[i]), WARMUP_DEPTH, WARMUP_GAIN, WARMUP_SHAPE)
          : nextTemperature(temp[i], y[i], height, maxTemp, particleSize)
      }
      // Velocity is rebuilt from scratch every frame instead of carried over, which makes the fluid
      // fully overdamped. The paper recomputes velocity from the previous position (Algorithm 1,
      // line 20); dropping that is what turns splashing water into wax.
      vx[i] = fx - stir * Math.sin(kx * x[i]) * Math.cos(ky * y[i])
      vy[i] = gravity + fy - temp[i] + vertical * Math.cos(kx * x[i]) * Math.sin(ky * y[i])
      x[i] += vx[i] * dt
      y[i] += vy[i] * dt
      hash.add(x[i], y[i], i)
    }

    for (let i = 0; i < alive; i++) {
      const neighbours = findNeighbours(state, hash, i, interactionRadius)
      updatePressure(state, i, neighbours, stiffness, stiffnessNear, restDensity)
      relax(state, i, neighbours, dt, frame - born[i] < OOZE_SETTLE_FRAMES)
      contain(i)
    }
  }

  function contain (i) {
    const { x, y } = state
    if (x[i] < 0) x[i] = 0
    else if (x[i] > width) x[i] = width
    if (y[i] < 0) y[i] = 0
    else if (y[i] > height) y[i] = height
  }

  return {
    step,
    resize,
    push,
    get state () { return state },
    get count () { return alive },
    get width () { return width },
    get height () { return height }
  }
}
