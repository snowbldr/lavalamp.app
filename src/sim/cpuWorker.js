// The CPU lamp's simulation on its own thread. The page's frame loop stepped the simulation on
// the main thread, and a step that took longer than a frame (20 ms at a desktop window's 7000
// particles on an M3 Pro, five times that on an efficiency core or a phone) stalled the drawing:
// a frame with a step in it took two or three vsyncs and the frames between took one, so the
// lava moved in pulses (Robert: "cpu looks like shit... It's got this like weird pulsing").
// Here the simulation steps on its own clock, FRAME of lamp time every FRAME / pace of wall
// time or as fast as it can when that is slower, and posts each state to the page, which draws
// at the display's rate and interpolates between the last two states it was given (see
// workerLamp.js). A slow device gets slow motion, never a stutter. The simulation itself is
// untouched: this file only carries messages in and states out.
import { seedRandom } from './random.js'
import { createSimulation } from './simulation.js'

const RADII = 192 // samples of a bottle's outline radius sent to the page for the Reservoirs view

let sim = null
let params = null
let frame = 1 / 60
let interval = frame * 1000 // wall ms between steps
let want = { flow: 0, heater: 0, cups: false }
let next = 0 // when the next step is due
let timer = 0
let generation = 0 // bumped by every transform, so the page can tell a state from before a turn
let cupsSent = null // the bottle lists last sent, by identity

// Bottles carry a function (radiusAt) and the page needs only the outline it draws, so the
// radius goes across as a table over the full turn.
function serialiseBottles (list) {
  return list.map(b => {
    const radii = new Float32Array(RADII)
    for (let k = 0; k < RADII; k++) radii[k] = b.radiusAt ? b.radiusAt(k / RADII * Math.PI * 2) : b.R
    const { radiusAt, outline, ...plain } = b
    return { ...plain, radii }
  })
}

function world () {
  const w = sim.width
  const h = sim.height
  const out = { elements: sim.heaterElements().map(el => ({ x: el.x, radius: el.radius, halfWidth: el.halfWidth, heat: el.heat, glow: el.glow })) }
  if (want.flow > 0) {
    const step = want.flow
    const cols = Math.ceil(w / step)
    const rows = Math.ceil(h / step)
    const data = new Float32Array(cols * rows * 2)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const [fx, fy] = sim.flowAt(step / 2 + c * step, step / 2 + r * step)
        const o = (c + r * cols) * 2
        data[o] = fx
        data[o + 1] = fy
      }
    }
    out.flow = { step, cols, rows, data }
  }
  if (want.heater > 0) {
    const cell = want.heater
    const cols = Math.ceil(w / cell)
    const data = new Float32Array(cols)
    for (let c = 0; c < cols; c++) data[c] = sim.heaterAt((c + 0.5) * cell)
    out.heater = { cell, data }
  }
  if (want.cups) {
    const bottles = sim.bottles()
    const floorBottles = sim.floorBottles()
    if (!cupsSent || cupsSent.bottles !== bottles || cupsSent.floorBottles !== floorBottles || cupsSent.w !== w || cupsSent.h !== h) {
      cupsSent = { bottles, floorBottles, w, h }
      const ceiling = new Float32Array(w + 1)
      const floor = new Float32Array(w + 1)
      for (let px = 0; px <= w; px++) { ceiling[px] = sim.ceilingAt(px); floor[px] = sim.floorAt(px) }
      out.cups = { ceiling, floor, bottles: serialiseBottles(bottles), floorBottles: serialiseBottles(floorBottles) }
    }
  } else cupsSent = null
  return out
}

function tick () {
  timer = 0
  const t0 = performance.now()
  sim.step(frame)
  const stepMs = performance.now() - t0
  const n = sim.count
  const s = sim.state
  const x = s.x.slice(0, n)
  const y = s.y.slice(0, n)
  const vx = s.vx.slice(0, n)
  const vy = s.vy.slice(0, n)
  const temp = s.temp.slice(0, n)
  const id = s.id.slice(0, n) // birth index: the step sorts the particles into cell order, so slot i is a different particle from one state to the next
  postMessage({ type: 'state', count: n, x, y, vx, vy, temp, id, stepMs, generation, width: sim.width, height: sim.height, world: world() }, [x.buffer, y.buffer, vx.buffer, vy.buffer, temp.buffer, id.buffer])
  const now = performance.now()
  // Behind (the step took longer than the interval): step again at once, no catching up.
  next = Math.max(next + interval, now)
  schedule(now)
}

function schedule (now = performance.now()) {
  if (timer) clearTimeout(timer)
  timer = 0
  if (!Number.isFinite(interval)) return // paused (pace 0)
  timer = setTimeout(tick, Math.max(0, next - now))
}

function setPace (pace) {
  const was = interval
  interval = pace > 0 ? frame / pace * 1000 : Infinity
  if (interval !== was) {
    const now = performance.now()
    next = Math.min(next, now + (Number.isFinite(interval) ? interval : 0))
    schedule(now)
  }
}

self.onmessage = ({ data: m }) => {
  switch (m.type) {
    case 'init':
      seedRandom(m.seed)
      params = m.params
      frame = m.frame
      want = m.want || want
      sim = createSimulation({ width: m.width, height: m.height, params })
      next = performance.now()
      setPace(m.pace)
      schedule()
      break
    case 'frame':
      if (m.params) Object.assign(params, m.params)
      sim.setTouches(m.touches || [])
      if (m.push) sim.push(m.push[0], m.push[1])
      for (let k = 0; k < (m.light || 0); k++) sim.lightElement()
      for (let k = 0; k < (m.eddy || 0); k++) sim.spawnEddy()
      if (m.want) want = m.want
      setPace(m.pace)
      break
    case 'resize':
      sim.resize(m.width, m.height)
      cupsSent = null
      break
    case 'transform': {
      // An affine map (the lamp turning to a new floor), as six numbers.
      const { a, b, c, d, e, f } = m
      sim.transform((x, y) => [a * x + b * y + c, d * x + e * y + f])
      generation = m.generation
      break
    }
  }
}
