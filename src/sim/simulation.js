import { SpatialHash } from './spatialHash.js'
import { findNeighbours, relax, updatePressure } from './fluid.js'
import { nextTemperature } from './heat.js'
import { randomBetween, randomNormal, randomRange } from './random.js'

const CELL_SIZE = 50
// How the lava arrives on load: all at once, as a warm slab already lying on the floor.
// SPAWN_HEAT is the fraction of gravity each particle starts at. Cold lava falls at full gravity
// into the stack every frame and pressure has to push it back apart, which jitters at 5x the
// steady state and reads as anxious; warm lava is calm lava. SPAWN_AREA is the floor area a
// settled particle takes up in square pixels (measured: 250 particles across 1000 px settle
// 100 px deep), so the slab appears at its resting depth and neither collapses nor bulges. The
// first second then jitters at 1.0 to 1.4 against the steady state 1.2; oozing the lava in from
// the floor, which this replaced, ran at 2.8 during the fill and "just feels weird".
const SPAWN_HEAT = 0.8
const SPAWN_AREA = 400
// On load the heat starts in the middle of the floor and spreads to the walls over WARMUP
// seconds, like a coil warming the base from the centre out. The floor outside the front still
// gets IDLE_HEAT. A flat warm up only delayed the explosion: every floor particle heats at the
// same rate from the same place, so they all cross buoyancy within the same second. Idle heat
// was 0.35 with a 45 s front, and that left the lava by the walls sinking at a fifth of gravity
// for forty seconds: it spread along the floor and the walls were the only way left, so it
// climbed them (37 particles within 20 px of the walls in the first half minute against 13 for
// a flat slab; "we got climbing on the side again for a minute at the start"). At 0.6 and 20 s
// the walls hold 12 and 78% of the first forty lifted particles still come from the middle half.
// An earlier version heated the whole depth of the slab during warm up and switched to contact
// heating when the front reached the walls; the switch read as a phase change ("it explodes into
// a bunch of small pieces"). Now there is one heat model from the first frame: contact heating at
// the floor, and conduction to carry it up into the blob.
const WARMUP = 20
const IDLE_HEAT = 0.6
// Conduction: each step a particle's temperature moves this fraction of the way toward the
// weighted mean of its neighbours. Without it every particle heats and cools on its own noise,
// neighbours drift apart in temperature and the hot ones tear out of a blob as droplets. It is
// a setting because it has a cliff: at 1000 px with 250 particles, 0 gives globs of 58 particles
// and 587 midline crossings a minute, 0.005 gives 67 and 399, 0.01 gives 112 and 36, and from
// 0.02 up the lamp is one hovering mass. Where to sit on that slope is a matter of taste.
const CONDUCTION = 0.005
// Heat spots (params.heatSpots is the mean seconds between one and the next, 0 for a steady
// heater). Robert: "it'd be cool if sometimes like 1/2 of the stuff formed one big glob" and
// "what if we did waves of heating to heat bigger groups of particles at the same time?" A
// steady heater lifts lava as soon as its bottom layer is warm, so nothing big ever builds; a
// uniform on/off cycle in time made globs smaller (every floor particle still heats at the same
// rate from the same place). A Gaussian hot spot sweeping along the floor took the biggest
// detached glob at 2560 x 1294 from 21% of the lava to 51%. Then: "instead of sweeping the
// bottom, we should apply heat in normal distribution random into random spots along the
// bottom, generally focusing the middle more. the radius of the heat, the temp, and application
// time should all vary." So: each spot lands at a floor position drawn from a bell curve centred
// on the middle (SPOT_SPREAD of the width as its standard deviation), with its own radius, peak
// power and life from these ranges, fading in and out on a sine. The floor away from any spot
// runs at SPOT_BASE of normal power, and overlapping spots add up to SPOT_CAP.
const SPOT_SPREAD = 0.2
const SPOT_RADIUS = [0.08, 0.3] // of the width
const SPOT_PEAK = [1.2, 2.5] // times normal power, above the base
const SPOT_LIFE = [10, 40] // seconds
const SPOT_BASE = 0.2
const SPOT_CAP = 3
// Turbulence: now and then an eddy appears at a random spot, a slow vortex that fades in and out
// over a few seconds, spinning either way. Each is a Gaussian vortex, so it is divergence free
// and moves the lava around without squashing it. The gap between eddies, their size and their
// life are drawn from these ranges; `turbulence` in params is the peak speed in px/s.
const EDDY_GAP = [6, 18] // seconds between one eddy starting and the next, at low turbulence
const EDDY_MAX = 150 // the slider's top; the gap shrinks to a quarter there ("more frequent at the highest setting")
const EDDY_RADIUS = [0.15, 0.3] // of the shorter side of the lamp
const EDDY_LIFE = [4, 10] // seconds
const EDDY_PEAK = 0.4289 // peak of r e^(-r^2), to scale the field to its stated speed
// Drifting eddies: the same vortex, but born with a velocity, bouncing off the walls and floor
// and dying away over its life instead of fading in and out in place. `drifters` in params is
// how many are alive at once; a new one is born a few seconds after one dies.
const DRIFT_SPEED = [30, 90] // px/s
const DRIFT_LIFE = [12, 30] // seconds
const DRIFT_GAP = [2, 6] // seconds between one dying and the next being born
// A drifter is shaped like a little tornado rather than a soft eddy: solid rotation inside a
// core of DRIFT_CORE px, then falling off as one over distance so the arrows wrap around it from
// far away, cut off smoothly at DRIFT_REACH cores out (or DRIFT_REACH_MAX of the lamp's shorter
// side, whichever is less). Its peak speed at the edge of the core is DRIFT_GAIN times the
// turbulence setting, times its own factor from DRIFT_VARIETY, so they come in random sizes and
// strengths ("Can we make them random sizes too?").
const DRIFT_CORE = [25, 140]
const DRIFT_REACH = 6
const DRIFT_REACH_MAX = 0.5
const DRIFT_GAIN = 2.5
const DRIFT_VARIETY = [0.7, 1.3]

// The whole simulation, with no knowledge of the DOM, settings or rendering.
// `params` is a plain object the caller keeps up to date:
//   particleCount, interactionRadius, stiffness, stiffnessNear, restDensity, maxTemp, gravity, particleSize, stir, conduction, turbulence, drifters, heatSpots
export function createSimulation ({ width, height, params }) {
  const hash = new SpatialHash(width, height, CELL_SIZE)
  const impulse = [0, 0]
  let state = allocate(params.particleCount)
  // The live count follows params.particleCount; particles added later appear in the slab too.
  let alive = 0
  let heaterTime = 0
  let time = 0
  let heaterPower = () => 1 // the heater power under a floor point, as of the last step
  const spots = []
  let nextSpot = 0
  const eddies = []
  let nextEddy = randomRange(...EDDY_GAP)
  const drifting = []
  let nextDrifter = randomRange(...DRIFT_GAP)

  function allocate (count) {
    return {
      x: new Float32Array(count),
      y: new Float32Array(count),
      vx: new Float32Array(count),
      vy: new Float32Array(count),
      temp: new Float32Array(count),
      p: new Float32Array(count), // pressure
      pNear: new Float32Array(count), // near pressure
      g: new Float32Array(count), // kernel weight scratch space, indexed by neighbour
      shared: new Float32Array(count) // neighbour mean temperature scratch space
    }
  }

  function spawn (i, depth) {
    state.x[i] = randomBetween(0, width)
    state.y[i] = randomBetween(height - depth, height)
    state.vx[i] = 0
    state.vy[i] = 0
    state.temp[i] = SPAWN_HEAT * params.gravity
  }

  // Make room for more particles. Existing particles keep their state. The arrays never shrink;
  // a step just stops at the number alive.
  function ensureCapacity (count) {
    if (count <= state.x.length) return
    const grown = allocate(count)
    for (const field of Object.keys(state)) grown[field].set(state[field])
    state = grown
  }

  // Start a new eddy when one is due and drop the ones that have faded out. Move the drifting
  // ones, bounce them off the walls, and replace the ones that have died.
  function stirEddies (dt, turbulence, drifters) {
    time += dt
    // Stronger turbulence is also more frequent: the gap scales from 1 at zero to 1/4 at the top.
    const pace = 1 - 0.75 * Math.min(1, Math.abs(turbulence) / EDDY_MAX)
    if (drifting.length < drifters && time >= nextDrifter) {
      const core = randomRange(...DRIFT_CORE)
      const radius = Math.min(DRIFT_REACH * core, DRIFT_REACH_MAX * Math.min(width, height))
      const speed = randomRange(...DRIFT_SPEED)
      const heading = randomRange(0, 2 * Math.PI)
      drifting.push({
        x: randomRange(core, width - core),
        y: randomRange(core, height - core),
        vx: speed * Math.cos(heading),
        vy: speed * Math.sin(heading),
        core,
        radius,
        gain: DRIFT_GAIN * randomRange(...DRIFT_VARIETY),
        spin: Math.random() < 0.5 ? -1 : 1,
        start: time,
        life: randomRange(...DRIFT_LIFE)
      })
      nextDrifter = time + randomRange(...DRIFT_GAP)
    }
    for (let k = drifting.length - 1; k >= 0; k--) {
      const e = drifting[k]
      if (time - e.start > e.life) {
        drifting.splice(k, 1)
        if (time + randomRange(...DRIFT_GAP) < nextDrifter || nextDrifter < time) nextDrifter = time + randomRange(...DRIFT_GAP)
        continue
      }
      e.x += e.vx * dt
      e.y += e.vy * dt
      const half = e.core
      if (e.x < half) { e.x = half; e.vx = Math.abs(e.vx) } else if (e.x > width - half) { e.x = width - half; e.vx = -Math.abs(e.vx) }
      if (e.y < half) { e.y = half; e.vy = Math.abs(e.vy) } else if (e.y > height - half) { e.y = height - half; e.vy = -Math.abs(e.vy) }
    }
    if (drifting.length > drifters) drifting.length = drifters
    if (time >= nextEddy) {
      const radius = randomRange(...EDDY_RADIUS) * Math.min(width, height)
      eddies.push({
        x: randomRange(radius / 2, width - radius / 2),
        y: randomRange(radius / 2, height - radius / 2),
        radius,
        spin: Math.random() < 0.5 ? -1 : 1,
        start: time,
        life: randomRange(...EDDY_LIFE)
      })
      nextEddy = time + randomRange(...EDDY_GAP) * pace
    }
    for (let k = eddies.length - 1; k >= 0; k--) {
      if (time - eddies[k].start > eddies[k].life) eddies.splice(k, 1)
    }
  }

  // The eddies' velocity at a point, written into `out`.
  function eddyVelocity (px, py, strength, out) {
    out[0] = 0
    out[1] = 0
    if (strength === 0) return
    for (let k = 0; k < eddies.length; k++) {
      const e = eddies[k]
      const dx = (px - e.x) / e.radius
      const dy = (py - e.y) / e.radius
      const envelope = Math.sin(Math.PI * (time - e.start) / e.life)
      const f = e.spin * strength / EDDY_PEAK * envelope * Math.exp(-(dx * dx + dy * dy))
      out[0] += -dy * f
      out[1] += dx * f
    }
    for (let k = 0; k < drifting.length; k++) {
      const e = drifting[k]
      const dx = px - e.x
      const dy = py - e.y
      const r = Math.hypot(dx, dy)
      if (r === 0) continue
      const age = time - e.start
      // A second to spin up, then dying away to nothing.
      const envelope = Math.min(1, age) * (1 - age / e.life)
      // Speed: rising linearly to the peak at the core's edge, then 2 r rc / (r^2 + rc^2),
      // which is one over distance in the tail, inside a Gaussian cutoff at the reach.
      const q = r / e.core
      const speed = e.gain * strength * envelope * 2 * q / (1 + q * q) * Math.exp(-(r * r) / (e.radius * e.radius))
      out[0] += -dy / r * speed * e.spin
      out[1] += dx / r * speed * e.spin
    }
  }

  // Bring the live count to the target, all at once, as a slab lying on the floor.
  function fill (target) {
    if (alive > target) alive = target
    if (alive === target) return
    const depth = SPAWN_AREA * target / width
    while (alive < target) spawn(alive++, depth)
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
    const { particleCount, interactionRadius, stiffness, stiffnessNear, restDensity, maxTemp, gravity, particleSize, stir = 0, conduction = CONDUCTION, turbulence = 0, drifters = 0, heatSpots = 0 } = params
    ensureCapacity(particleCount)
    fill(particleCount)
    stirEddies(dt, turbulence, drifters)
    // Warm up: the heater power is a front spreading from the middle of the floor (see WARMUP).
    heaterTime += dt
    const progress = Math.min(1, heaterTime / WARMUP)
    const halfWidth = width / 2
    // Heat spots: once warmed up, the heater is a few hot spots at random places along the
    // floor, each with its own size, power and life, so one big stretch of the pool heats
    // together and lifts as one glob instead of the whole floor shedding small ones at the same
    // rate from the same place.
    if (progress >= 1 && heatSpots > 0) {
      if (heaterTime >= nextSpot) {
        const sigma = SPOT_SPREAD * width
        let sx = halfWidth + randomNormal() * sigma
        if (sx < width * 0.05) sx = width * 0.05
        if (sx > width * 0.95) sx = width * 0.95
        spots.push({ x: sx, radius: randomRange(...SPOT_RADIUS) * width, peak: randomRange(...SPOT_PEAK), start: heaterTime, life: randomRange(...SPOT_LIFE) })
        nextSpot = heaterTime + randomRange(0.5, 1.5) * heatSpots
      }
      for (let k = spots.length - 1; k >= 0; k--) if (heaterTime - spots[k].start > spots[k].life) spots.splice(k, 1)
    } else if (spots.length) {
      spots.length = 0
    }
    const powerAt = x => {
      if (progress >= 1) {
        if (heatSpots <= 0) return 1
        let power = SPOT_BASE
        for (let k = 0; k < spots.length; k++) {
          const sp = spots[k]
          const d = (x - sp.x) / sp.radius
          power += sp.peak * Math.sin(Math.PI * (heaterTime - sp.start) / sp.life) * Math.exp(-d * d)
        }
        return power > SPOT_CAP ? SPOT_CAP : power
      }
      const r = Math.abs(x - halfWidth) / halfWidth
      const p = (progress * 1.2 - r) / 0.2
      return p < IDLE_HEAT ? IDLE_HEAT : p > 1 ? 1 : p
    }
    heaterPower = powerAt
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
    const eddy = [0, 0]

    hash.clear()
    for (let i = 0; i < alive; i++) {
      temp[i] = nextTemperature(temp[i], y[i], height, maxTemp, particleSize, powerAt(x[i]))
      // Velocity is rebuilt from scratch every frame instead of carried over, which makes the fluid
      // fully overdamped. The paper recomputes velocity from the previous position (Algorithm 1,
      // line 20); dropping that is what turns splashing water into wax.
      eddyVelocity(x[i], y[i], turbulence, eddy)
      vx[i] = fx - stir * Math.sin(kx * x[i]) * Math.cos(ky * y[i]) + eddy[0]
      vy[i] = gravity + fy - temp[i] + vertical * Math.cos(kx * x[i]) * Math.sin(ky * y[i]) + eddy[1]
      x[i] += vx[i] * dt
      y[i] += vy[i] * dt
      hash.add(x[i], y[i], i)
    }

    const { g, shared } = state
    for (let i = 0; i < alive; i++) {
      const neighbours = findNeighbours(state, hash, i, interactionRadius)
      updatePressure(state, i, neighbours, stiffness, stiffnessNear, restDensity)
      let weight = 0
      let heat = 0
      for (let k = 0; k < neighbours.length; k++) {
        const n = neighbours[k]
        weight += g[n]
        heat += g[n] * temp[n]
      }
      shared[i] = weight > 0 ? heat / weight : temp[i]
      relax(state, i, neighbours, dt)
      contain(i)
    }
    // Applied after the pass so every particle saw the same temperatures.
    for (let i = 0; i < alive; i++) temp[i] += conduction * (shared[i] - temp[i])
  }

  // The heater power under a point on the floor as of the last step, 0 up to SPOT_CAP, for
  // drawing the heat map.
  function heaterAt (px) {
    return heaterPower(px)
  }

  // The stirring velocity (convection roll plus eddies) at a point, for drawing the flow field.
  function flowAt (px, py) {
    const { stir = 0, turbulence = 0 } = params
    const kx = 2 * Math.PI / width
    const ky = Math.PI / height
    const out = [0, 0]
    eddyVelocity(px, py, turbulence, out)
    out[0] -= stir * Math.sin(kx * px) * Math.cos(ky * py)
    out[1] += 2 * stir * height / width * Math.cos(kx * px) * Math.sin(ky * py)
    return out
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
    flowAt,
    heaterAt,
    get state () { return state },
    get count () { return alive },
    get width () { return width },
    get height () { return height }
  }
}
