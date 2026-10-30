import { SpatialHash } from './spatialHash.js'
import { findNeighbours, relax, updatePressure } from './fluid.js'
import { nextTemperature } from './heat.js'
import { randomBetween } from './random.js'

const CELL_SIZE = 50

// The whole simulation, with no knowledge of the DOM, settings or rendering.
// `params` is a plain object the caller keeps up to date:
//   particleCount, interactionRadius, stiffness, stiffnessNear, restDensity, maxTemp, gravity, particleSize
export function createSimulation ({ width, height, params }) {
  const hash = new SpatialHash(width, height, CELL_SIZE)
  const impulse = [0, 0]
  let state = allocate(params.particleCount)
  for (let i = 0; i < params.particleCount; i++) spawn(i)

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
    state.x[i] = randomBetween(0, width)
    state.y[i] = randomBetween(0, height)
    state.vx[i] = 0
    state.vy[i] = 0
    state.temp[i] = 0
  }

  // Make room for more particles. Existing particles keep their state. The arrays never shrink;
  // a step just stops at params.particleCount.
  function ensureCapacity (count) {
    const previous = state.x.length
    if (count <= previous) return
    const grown = allocate(count)
    for (const field of Object.keys(state)) grown[field].set(state[field])
    state = grown
    for (let i = previous; i < count; i++) spawn(i)
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
    const { particleCount, interactionRadius, stiffness, stiffnessNear, restDensity, maxTemp, gravity, particleSize } = params
    ensureCapacity(particleCount)
    const { x, y, vx, vy, temp } = state
    const fx = impulse[0]
    const fy = impulse[1]
    impulse[0] = 0
    impulse[1] = 0

    hash.clear()
    for (let i = 0; i < particleCount; i++) {
      temp[i] = nextTemperature(temp[i], y[i], height, maxTemp, particleSize)
      // Velocity is rebuilt from scratch every frame instead of carried over, which makes the fluid
      // fully overdamped. The paper recomputes velocity from the previous position (Algorithm 1,
      // line 20); dropping that is what turns splashing water into wax.
      vx[i] = fx
      vy[i] = gravity + fy - temp[i]
      x[i] += vx[i] * dt
      y[i] += vy[i] * dt
      hash.add(x[i], y[i], i)
    }

    for (let i = 0; i < particleCount; i++) {
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
    get count () { return params.particleCount },
    get width () { return width },
    get height () { return height }
  }
}
