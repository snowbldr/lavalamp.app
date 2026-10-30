import { SpatialHash } from './spatialHash.js'
import { findNeighbours, relax, updatePressure } from './fluid.js'
import { nextTemperature } from './heat.js'
import { randomBetween } from './random.js'

const CELL_SIZE = 50
// Particles ooze up out of the floor at this rate, in particles per second.
const OOZE_RATE = 40
// New particles start anywhere from cold up to this fraction of gravity, so some of the puddle is
// already warm and the first blobs lift off at different times on every load.
const OOZE_HEAT = 0.5

// The whole simulation, with no knowledge of the DOM, settings or rendering.
// `params` is a plain object the caller keeps up to date:
//   particleCount, interactionRadius, stiffness, stiffnessNear, restDensity, maxTemp, gravity, particleSize, stir
export function createSimulation ({ width, height, params }) {
  const hash = new SpatialHash(width, height, CELL_SIZE)
  const impulse = [0, 0]
  let state = allocate(params.particleCount)
  // Particles are not all alive at once. They ooze up out of the middle of the floor until the
  // count is reached, and ooze again whenever the count is raised.
  let alive = 0
  let pending = 0

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
    state.x[i] = width / 2 + randomBetween(-5, 6)
    state.y[i] = height
    state.vx[i] = 0
    state.vy[i] = 0
    state.temp[i] = randomBetween(0, params.gravity * OOZE_HEAT)
  }

  // Make room for more particles. Existing particles keep their state. The arrays never shrink;
  // a step just stops at the number alive.
  function ensureCapacity (count) {
    if (count <= state.x.length) return
    const grown = allocate(count)
    for (const field of Object.keys(state)) grown[field].set(state[field])
    state = grown
  }

  // Bring the live count toward the target, a few particles per frame.
  function pour (target, dt) {
    if (alive > target) alive = target
    if (alive === target) {
      pending = 0
      return
    }
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
    ensureCapacity(particleCount)
    pour(particleCount, dt)
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
      temp[i] = nextTemperature(temp[i], y[i], height, maxTemp, particleSize)
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
      relax(state, i, neighbours, dt)
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
