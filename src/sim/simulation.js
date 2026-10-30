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
// the floor, and conduction to carry it up into the blob. The front was 20 s; the heating
// elements only start once it is done, and Robert: "there's a long delay before the donuts fire
// ... needs to be like 1/10th the time".
const WARMUP = 2
const IDLE_HEAT = 0.6
// Conduction: each step a particle's temperature moves this fraction of the way toward the
// weighted mean of its neighbours. Without it every particle heats and cools on its own noise,
// neighbours drift apart in temperature and the hot ones tear out of a blob as droplets. It is
// a setting because it has a cliff: at 1000 px with 250 particles, 0 gives globs of 58 particles
// and 587 midline crossings a minute, 0.005 gives 67 and 399, 0.01 gives 112 and 36, and from
// 0.02 up the lamp was one hovering mass. That was with contact heating at the floor only; with
// heating elements that warm the pool in depth it can take in more heat than it sheds, and 0.02
// is where Robert set the default ("maximum lava gloopiness").
const CONDUCTION = 0.02
// Heating elements. Robert: "what I actually want is actually like a random point heat source
// just like the touch heat ... little donut shaped heating elements at random intervals on the
// bottom of the glass that we randomly turn on at different heats", "randomly distributed donut
// heating elements of different sizes across the bottom", "probably randomly generated once on
// start". So: once, at start, ring elements are laid along the floor about ELEMENT_GAP px apart
// (jittered), each with its own radius in ELEMENT_RADIUS of the lamp's shorter side. Every
// params.heatSpots seconds or so (0 for a steady floor heater) one lights, chosen with a bell
// curve favouring the middle (SPOT_SPREAD of the width), at a heat drawn from ELEMENT_HEAT
// (temperature per step at its centre, the finger on Heat gives 12) for ELEMENT_LIFE seconds,
// fading in and out on a sine. A lit element warms the lava in a half disc around it, like a
// finger, so a lump of the pool heats at once and lifts as one. The floor itself stays a contact
// heater at SPOT_BASE of normal power, brighter under a lit element, up to SPOT_CAP.
//
// Before this the heater went through: a steady floor (small globs), a hot spot sweeping the
// floor, random Gaussian spots along the floor (biggest detached glob 48% of the lava, but only
// the bottom row ever warmed and the cold pool above quenched it), a heated layer across the
// floor (streams or lifts entire), and heating rods as a heat battery with a base to tip
// gradient (half the lava rose as one dome at max conduction, but the pool floated on the rod
// tips until the tips were cooled, and Robert still had to push max temp to the top to get
// blobs: "It does kind of work, but ..."). The record is in docs/decisions.md.
const ELEMENT_GAP = 200 // px between elements, before jitter
const ELEMENT_RADIUS = [0.08, 0.2] // of the shorter side
const ELEMENT_HEAT = [2, 6] // temperature per step at the centre; the finger gives 12, and at 4 to 12 an element fired a stream of small globs
const ELEMENT_LIFE = [5, 15] // seconds
// Robert: "more smaller ones ... or probably better is of varying size smaller ones more
// frequent". Sizes skew small (ELEMENT_SIZE_SKEW on a uniform draw, above 1 for more small
// ones), and each element runs its own clock: its mean interval is params.heatSpots times the
// element count divided by ELEMENT_RATE (so about ELEMENT_RATE elements light per heatSpots
// seconds in all), shared out so that small rings light often and big ones rarely, and ones
// near the middle more than ones by the walls, with a spread of 0.5 to 1.5 on every wait.
// Several lit at once falls out of that on its own; a first version lit 1 to 5 together from one
// shared clock with a mean of 1.6, at Robert's request, and this replaced it the same hour.
const ELEMENT_SIZE_SKEW = 1.6
const ELEMENT_RATE = 3
const SPOT_SPREAD = 0.2
const SPOT_BASE = 0.2
const SPOT_CAP = 3
// Cups in the ceiling. Robert, on a glob that spread flat under the ceiling, cooled as a sheet
// and fell as a strip: "put like a zig zag, or cups at the top for the lava to sit in so that
// they would stay globbed as they cool and fall down as big blobs instead of a strip", then
// "cups with random normal sizes from medium to pretty big, more wide than tall, oval shape
// cups". The ceiling is a row of half ellipse arches laid once at start: widths drawn from a
// bell curve (CUP_WIDTH mean and deviation, clipped to CUP_WIDTH_RANGE, all as fractions of the
// shorter side) and scaled to tile the width exactly; each cup is params.cupDepth of its width
// deep (0 for the flat ceiling). Lava rising into a cup pools in it and keeps a glob's outline
// while it cools. The cups sit above the screen with only their bottom lips showing, CUP_LIP of
// the shorter side below the top edge, like the cap on a real lamp (Robert: "need to be a little
// narrower, like elongated vertically ... hide the cups above the screen except for just the
// bottom edge of the cups, they're kinda ugly and ruin the effect, and it's the same as the cap
// on the lava lamp"); lava that rises into a cup goes out of sight and comes back as it cools.
const CUP_WIDTH = [0.3, 0.08] // mean, deviation
const CUP_WIDTH_RANGE = [0.2, 0.45]
const CUP_LIP = 0.04
// Touch. A finger (or the mouse) acts in a soft circle TOUCH_RADIUS of the lamp's shorter side
// across (never under TOUCH_MIN px): push shoves lava outward and carries it with a drag, pull
// gathers it, spin is a tornado under the finger, heat and cool change temperature.
const TOUCH_RADIUS = 0.12
const TOUCH_MIN = 80
const TOUCH_PUSH = 250 // px/s at the centre
const TOUCH_SPIN = 300 // px/s at the edge of the core
const TOUCH_HEAT = 12 // px/s of temperature per step
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
//   particleCount, interactionRadius, stiffness, stiffnessNear, restDensity, maxTemp, gravity, particleSize, stir, conduction, turbulence, drifters, heatSpots, cupDepth
export function createSimulation ({ width, height, params }) {
  const hash = new SpatialHash(width, height, CELL_SIZE)
  const impulse = [0, 0]
  let state = allocate(params.particleCount)
  // The live count follows params.particleCount; particles added later appear in the slab too.
  let alive = 0
  let heaterTime = 0
  let time = 0
  let heaterPower = () => 1 // the heater power under a floor point, as of the last step
  let touches = [] // { x, y, vx, vy, mode } for this step, set by the caller
  // The heating elements, laid out once: { fx, fr } as fractions of the width and shorter side,
  // plus their lit state { heat, start, life } while lit.
  const elements = []
  // The ceiling cups, laid out once: { fx, fw } centre and width as fractions of the width.
  const cups = []
  let cupDepthNow = 0 // params.cupDepth as of the last step, for ceilingAt
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

  // The fingers on the lamp for the next step: [{ x, y, vx, vy, mode }], mode one of
  // 'push', 'pull', 'spin', 'heat', 'cool'.
  function setTouches (list) {
    touches = list
  }

  // Velocity (into `out`) and temperature change (returned) from the fingers at a point.
  function touchAt (px, py, dt, maxTemp, out) {
    out[0] = 0
    out[1] = 0
    let heat = 0
    const radius = Math.max(TOUCH_MIN, TOUCH_RADIUS * Math.min(width, height))
    for (let k = 0; k < touches.length; k++) {
      const t = touches[k]
      const dx = px - t.x
      const dy = py - t.y
      const r = Math.hypot(dx, dy)
      const q = r / radius
      if (q > 2.5) continue
      const w = Math.exp(-q * q)
      switch (t.mode) {
        case 'push': {
          const ux = r > 0 ? dx / r : 0
          const uy = r > 0 ? dy / r : 0
          out[0] += (TOUCH_PUSH * ux + t.vx) * w
          out[1] += (TOUCH_PUSH * uy + t.vy) * w
          break
        }
        case 'pull': {
          // Toward the finger, never past it.
          const speed = Math.min(TOUCH_PUSH * w, r / dt)
          if (r > 0) {
            out[0] += -dx / r * speed + t.vx * w
            out[1] += -dy / r * speed + t.vy * w
          }
          break
        }
        case 'spin': {
          const core = radius * 0.5
          const c = r / core
          const speed = TOUCH_SPIN * 2 * c / (1 + c * c) * Math.exp(-(q * q) / 4)
          if (r > 0) {
            out[0] += -dy / r * speed + t.vx * w
            out[1] += dx / r * speed + t.vy * w
          }
          break
        }
        case 'heat':
          heat += TOUCH_HEAT * w
          break
        case 'cool':
          heat -= TOUCH_HEAT * w
          break
      }
    }
    return heat
  }

  // Move every particle by a function of its position. Used when the lamp turns to follow gravity.
  function transform (fn) {
    const { x, y } = state
    for (let i = 0; i < alive; i++) {
      const [nx, ny] = fn(x[i], y[i])
      x[i] = nx
      y[i] = ny
    }
  }

  function step (dt) {
    const { particleCount, interactionRadius, stiffness, stiffnessNear, restDensity, maxTemp, gravity, particleSize, stir = 0, conduction = CONDUCTION, turbulence = 0, drifters = 0, heatSpots = 0, cupDepth = 0 } = params
    cupDepthNow = cupDepth
    if (cups.length === 0) layoutCups()
    ensureCapacity(particleCount)
    fill(particleCount)
    stirEddies(dt, turbulence, drifters)
    // Warm up: the heater power is a front spreading from the middle of the floor (see WARMUP).
    heaterTime += dt
    const progress = Math.min(1, heaterTime / WARMUP)
    const halfWidth = width / 2
    if (elements.length === 0) layoutElements()
    const shorter = Math.min(width, height)
    // Once warmed up, elements light on their own clocks (see ELEMENT_GAP and ELEMENT_RATE).
    if (progress >= 1 && heatSpots > 0) {
      let weight = 0
      for (const el of elements) weight += el.weight
      for (const el of elements) {
        if (el.heat > 0) {
          if (heaterTime - el.start > el.life) el.heat = 0
          continue
        }
        // Each element's share of ELEMENT_RATE lightings per heatSpots seconds is its weight over
        // the total, so the lightings add up to that rate whatever the sizes and positions.
        if (el.next === 0) el.next = heaterTime + heatSpots / ELEMENT_RATE * weight / el.weight * randomRange(0.5, 1.5)
        if (heaterTime >= el.next) {
          el.heat = randomRange(...ELEMENT_HEAT)
          el.start = heaterTime
          el.life = randomRange(...ELEMENT_LIFE)
          el.next = 0
        }
      }
    } else {
      for (const el of elements) {
        el.heat = 0
        el.next = 0
      }
    }
    // Each lit element's glow, 0 to 1, and its reach in px, for this step.
    let maxReach = 0
    for (const el of elements) {
      el.x = el.fx * width
      el.radius = el.fr * shorter
      el.glow = el.heat > 0 ? Math.sin(Math.PI * (heaterTime - el.start) / el.life) : 0
      if (el.glow > 0 && el.radius * 2 > maxReach) maxReach = el.radius * 2
    }
    const powerAt = x => {
      if (progress >= 1) {
        if (heatSpots <= 0) return 1
        let power = SPOT_BASE
        for (const el of elements) {
          if (el.glow <= 0) continue
          const d = (x - el.x) / el.radius
          power += 2 * el.glow * Math.exp(-d * d)
        }
        return power > SPOT_CAP ? SPOT_CAP : power
      }
      const r = Math.abs(x - halfWidth) / halfWidth
      const p = (progress * 1.2 - r) / 0.2
      return p < IDLE_HEAT ? IDLE_HEAT : p > 1 ? 1 : p
    }
    heaterPower = powerAt
    // The heat a lit element delivers to a point: its heat at the centre, Gaussian over its radius.
    const elementHeat = (px, py) => {
      let heat = 0
      const dy = height - py
      for (const el of elements) {
        if (el.glow <= 0) continue
        const dx = px - el.x
        const d2 = (dx * dx + dy * dy) / (el.radius * el.radius)
        if (d2 < 4) heat += el.heat * el.glow * Math.exp(-d2)
      }
      return heat
    }
    const elementReach = height - maxReach
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
    const finger = [0, 0]
    const touching = touches.length > 0

    hash.clear()
    for (let i = 0; i < alive; i++) {
      temp[i] = nextTemperature(temp[i], y[i], height, maxTemp, particleSize, powerAt(x[i]))
      if (maxReach > 0 && y[i] > elementReach) {
        const heat = elementHeat(x[i], y[i])
        if (heat > 0) temp[i] = Math.min(maxTemp, temp[i] + heat)
      }
      if (touching) {
        const heat = touchAt(x[i], y[i], dt, maxTemp, finger)
        if (heat !== 0) temp[i] = Math.max(0, Math.min(maxTemp, temp[i] + heat))
      } else {
        finger[0] = 0
        finger[1] = 0
      }
      // Velocity is rebuilt from scratch every frame instead of carried over, which makes the fluid
      // fully overdamped. The paper recomputes velocity from the previous position (Algorithm 1,
      // line 20); dropping that is what turns splashing water into wax.
      eddyVelocity(x[i], y[i], turbulence, eddy)
      vx[i] = fx - stir * Math.sin(kx * x[i]) * Math.cos(ky * y[i]) + eddy[0] + finger[0]
      vy[i] = gravity + fy - temp[i] + vertical * Math.cos(kx * x[i]) * Math.sin(ky * y[i]) + eddy[1] + finger[1]
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

  // Lay the elements along the floor once: about ELEMENT_GAP px apart, jittered by up to 40% of
  // the gap, each with its own radius. Positions are fractions so a resize keeps the same lamp.
  function layoutElements () {
    const count = Math.max(2, Math.round(width / ELEMENT_GAP))
    for (let k = 0; k < count; k++) {
      const fx = (k + 0.5 + randomRange(-0.4, 0.4)) / count
      const fr = ELEMENT_RADIUS[0] + (ELEMENT_RADIUS[1] - ELEMENT_RADIUS[0]) * Math.pow(Math.random(), ELEMENT_SIZE_SKEW)
      // How often it lights, relative to the others: small rings more than big ones, and ones near
      // the middle more than ones by the walls (the same lean as the old heat spots).
      const d = (fx - 0.5) / SPOT_SPREAD
      const weight = (0.25 + 0.75 * Math.exp(-d * d / 2)) * ELEMENT_RADIUS[0] / fr
      elements.push({ fx, fr, weight, heat: 0, start: 0, life: 0, next: 0, x: 0, radius: 0, glow: 0 })
    }
  }

  // The heating elements, { x, radius, glow } in px and 0 to 1, for drawing the heat map.
  function heaterElements () {
    return elements
  }

  // The stirring velocity (convection roll, eddies and fingers) at a point, for drawing the flow
  // field.
  function flowAt (px, py) {
    const { stir = 0, turbulence = 0, maxTemp = 1000 } = params
    const kx = 2 * Math.PI / width
    const ky = Math.PI / height
    const out = [0, 0]
    eddyVelocity(px, py, turbulence, out)
    if (touches.length) {
      const finger = [0, 0]
      touchAt(px, py, 1 / 60, maxTemp, finger)
      out[0] += finger[0]
      out[1] += finger[1]
    }
    out[0] -= stir * Math.sin(kx * px) * Math.cos(ky * py)
    out[1] += 2 * stir * height / width * Math.cos(kx * px) * Math.sin(ky * py)
    return out
  }

  function contain (i) {
    const { x, y } = state
    if (x[i] < 0) x[i] = 0
    else if (x[i] > width) x[i] = width
    const top = cupDepthNow > 0 ? ceilingAt(x[i]) : 0
    if (y[i] < top) y[i] = top
    else if (y[i] > height) y[i] = height
  }

  // Lay the cups across the ceiling once (see CUP_WIDTH): bell curve widths, then all scaled so
  // they tile the width exactly. Fractions, so a resize keeps the same lamp.
  function layoutCups () {
    const shorter = Math.min(width, height)
    const widths = []
    let total = 0
    while (total < width) {
      let w = (CUP_WIDTH[0] + randomNormal() * CUP_WIDTH[1]) * shorter
      w = Math.max(CUP_WIDTH_RANGE[0] * shorter, Math.min(CUP_WIDTH_RANGE[1] * shorter, w))
      widths.push(w)
      total += w
    }
    let at = 0
    for (const w of widths) {
      const fw = w / total
      cups.push({ fx: at + fw / 2, fw })
      at += fw
    }
  }

  // The ceiling's height at a point: the cup lips at CUP_LIP of the shorter side below the top
  // edge, rising (to negative y, above the screen) on a half ellipse to cupDepth of the cup's
  // width above the lip at the centre. Positive is down.
  function ceilingAt (px) {
    const f = Math.max(0, Math.min(1, px / width))
    let cup = cups[cups.length - 1]
    for (const c of cups) if (f <= c.fx + c.fw / 2) { cup = c; break }
    const a = cup.fw * width / 2
    const depth = cupDepthNow * cup.fw * width
    const u = (px - cup.fx * width) / a
    return CUP_LIP * Math.min(width, height) - depth * Math.sqrt(Math.max(0, 1 - u * u))
  }

  return {
    step,
    resize,
    push,
    setTouches,
    transform,
    flowAt,
    heaterAt,
    heaterElements,
    ceilingAt,
    get state () { return state },
    get count () { return alive },
    get width () { return width },
    get height () { return height }
  }
}
