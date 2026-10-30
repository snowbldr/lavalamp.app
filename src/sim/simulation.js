import { SpatialHash } from './spatialHash.js'
import { findNeighbours, relax, updatePressure } from './fluid.js'
import { nextTemperature } from './heat.js'
import { random, randomBetween, randomNormal, randomRange } from './random.js'

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
// Elements are footballs, ELEMENT_ASPECT times as wide as they are tall (Robert: "perhaps we
// should make them wider? like football shaped? that might get bigger blobs"); the radius above
// is the half height.
const ELEMENT_ASPECT = 3
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
// The ceiling cups are bottles (Robert, on lava still spreading thin over the cups and coming
// down as wavy sheets: "What if we did like globular cups. So it'd be like an upside down
// spherical bottle with a spout. we'd want a widish spout so it doesn't stream out and globs
// out", and "we could also make the spouts varying length, so then we could actually overlap
// big bottles with small bottles"). Each cup is a mouth in the flat lip line, BOTTLE_MOUTH of
// the cup's half width either side, a neck BOTTLE_NECK of the shorter side long (drawn per
// bottle, as a fraction of the shorter side), and a round bulb above it as wide as the cup
// (radius = half width x cupDepth). A
// glob rises through the mouth, gathers in the bulb while it is hot, cools as a glob and falls
// back out through the mouth. Containment is "inside some bottle, or below the lip", so bulbs
// at different heights may overlap.
const BOTTLE_MOUTH = 0.6
const BOTTLE_NECK = [0.05, 0.4]
// Bottles in the floor too, hidden below the screen like the base of the lamp (Robert: "what
// if, we have hidden cups on the bottom too? ... enough lava to fill all the cups and still
// leave a visible layer on the bottom that's slightly smaller", then, once the ceiling had
// bottles, "let's test them on the bottom too. we might need more lava to fill them again").
// Their own random row with the end bottles centred on the walls (with rims at the walls the
// corner was the floor's high point under the down-the-wall flow and lava piled there: "we got
// significant wall climbing back"), mouths in the bottom edge, short necks down, bulbs
// FLOOR_BULB of the ceiling's radius. The hidden lava is a cold reserve the pool draws on as it
// lifts: heating it as well put about twice the lava in reach of the heater and the whole pool
// hovered as one mass. Each floor bottle is a heating element whose core runs from the mouth
// down into the bulb, so the neck is the spout. The default particle count (settings.js) pays
// for the bottles' volume.
const FLOOR_BULB = 0.7 // was 0.55; Robert: "make the bottles on the bottom a little deeper"
const FLOOR_NECK = [0.05, 0.18] // of the shorter side, was 0.02 to 0.1
// Every neck is rounded at both ends with fillets BOTTLE_ROUND of the mouth's half width: a
// quarter circle where it meets the line, and at the shoulder a circle tangent to both the neck
// wall and the bulb, so the wall runs straight, curves outward once and meets the sphere with no
// corner (Robert: "round out the edges of the bottles instead of these square ends", then, of a
// first flare that widened the neck past the bulb, "those little flourishes are making these
// mickey mouse ears that jitter ... the bottle neck should smooth meet the tangent on the sphere
// at some point with no extra lines").
const BOTTLE_ROUND = 0.6
// Bulb shapes (Robert: "we should make randomly shaped bottles ... it's very clear that the shape
// of the top and bottom have a significant impact on the way the lava blobs are shaped ... star
// shaped. we'd just need to remove any stuff that would block the exit and trap lava. ooo
// probably a cloud shape and random ooze and splat shapes could all be good... let's try a
// bunch"). A bulb is a polar outline around its centre: a circle on the side facing the mouth,
// so lava always funnels to the exit, and one of these shapes on the far side, faded in between
// SHAPE_SMOOTH and SHAPE_FULL degrees from the mouth direction. Drawn per bottle from the seed.
const BULB_SHAPES = ['round', 'star', 'cloud', 'ooze', 'splat']
const SHAPE_SMOOTH = 60
const SHAPE_FULL = 120
// How well heat conducts between lava in two different bottles, as a share of the usual.
const GLASS_CONDUCTION = 0.3
// Robert: "the heater... should it like, be the cup? Like should there just be one heater that
// heats the whole cup?" With this on, the heating elements are the floor cups themselves: one
// per cup, centred on it, as wide as the cup and reaching as far above the bottom edge as the
// cup goes below it, lit on the same clocks, and heating the lava hidden in the cup as well as
// the lava above it, so a whole cup's worth warms together.
const ELEMENTS_ARE_CUPS = true
// A lit cup heats a core at its centre ELEMENT_CORE of the shorter side wide (half width), the
// same in every cup, not the whole cup: heating the whole width made a big cup's middle go
// buoyant all at once and blast, with two streams following at the sides where the heat was
// weaker (Robert: "The big cups always present as two streams shooting up at the sides of the
// cup because the whole center blasts up immediately ... give the impression that it's got like
// a limitless supply of lava and keeps streaming up in a single spout"). The core reaches to
// the bottom of the cup, lava rises from it as fast as it warms, the cup's reserve flows in to
// replace it, and a bigger cup burns for longer (life scaled by its area over the smallest
// cup's, up to ELEMENT_LIFE_SCALE times) because it has more to drain. But not always narrow
// ("we also don't want a thin spout all the time either, I like the variance in spout size"):
// each lighting draws its core width between ELEMENT_CORE and the whole cup, leaning narrow
// (a uniform draw squared), and trades life for width, so a wide burn is short and a narrow
// one runs long.
const ELEMENT_CORE = 0.1
const ELEMENT_LIFE_SCALE = 4
// Whether lava hidden in the floor bottles gets the floor's contact heating as well (heated, the pool hovered).
const HEAT_IN_CUPS = false
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
  const cups = [] // the ceiling: { fx, fw, fn } centre and width as fractions of the width, neck as a fraction of the shorter side
  const floorCups = [] // same shape, for the floor
  let kicked = false // whether the kick-off lighting has happened
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
      shared: new Float32Array(count), // neighbour mean temperature scratch space
      home: new Int16Array(count).fill(-1) // the bottle a hidden particle is in, -1 for none
    }
  }

  // In the visible slab `depth` px above the bottom edge, or, with `hidden`, inside a floor
  // bottle (one picked by area, a point picked uniformly inside its bulb or neck).
  function spawn (i, depth, hidden = false) {
    const list = hidden ? floorBottleList() : []
    state.home[i] = -1
    state.x[i] = randomBetween(0, width)
    state.y[i] = randomRange(height - depth, height)
    if (list.length) {
      let total = 0
      for (const b of list) total += bottleArea(b)
      let pick = random() * total
      let k = list.length - 1
      for (let j = 0; j < list.length; j++) { pick -= bottleArea(list[j]); if (pick <= 0) { k = j; break } }
      const b = list[k]
      const bulb = bottleArea(b) - 2 * b.w * Math.abs(b.neckEnd - b.lineY)
      for (let tries = 0; tries < 50; tries++) {
        let px, py
        if (random() * bottleArea(b) < bulb) {
          px = b.cx + randomRange(-b.reach, b.reach)
          py = b.cy + randomRange(-b.reach, b.reach)
          const rr = b.radiusAt(Math.atan2(py - b.cy, px - b.cx))
          if ((px - b.cx) ** 2 + (py - b.cy) ** 2 > rr * rr) continue
        } else {
          px = b.cx + randomRange(-b.w, b.w)
          py = b.dir > 0 ? randomRange(b.lineY, b.neckEnd) : randomRange(b.neckEnd, b.lineY)
        }
        if (px < 0 || px > width) continue
        state.x[i] = px
        state.y[i] = py
        state.home[i] = k
        break
      }
    }
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
        spin: random() < 0.5 ? -1 : 1,
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
        spin: random() < 0.5 ? -1 : 1,
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

  // Bring the live count to the target, all at once: the floor bottles' worth inside them and
  // the rest as a slab lying on the floor.
  function fill (target) {
    if (alive > target) alive = target
    if (alive === target) return
    if (floorCups.length === 0) layoutCups(floorCups, true)
    let area = 0
    for (const b of floorBottleList()) area += bottleArea(b) * (b.cx <= 0 || b.cx >= width ? 0.5 : 1)
    const hidden = Math.min(target, Math.round(area / SPAWN_AREA))
    const depth = Math.max(0, SPAWN_AREA * (target - hidden) / width)
    const start = alive
    while (alive < target) {
      const i = alive++
      spawn(i, depth, i - start < hidden)
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
    if (floorCups.length === 0) layoutCups(floorCups, true)
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
      // Kick off: the first time the warm-up is done, the heaviest element (small, near the
      // middle) lights at once, so the lamp never waits on the clocks for its first glob.
      if (!kicked) {
        kicked = true
        let best = elements[0]
        for (const el of elements) if (el.weight > best.weight) best = el
        best.next = heaterTime
        best.fresh = false
      }
      for (const el of elements) {
        if (el.heat > 0) {
          if (heaterTime - el.start > el.life) el.heat = 0
          continue
        }
        // Each element's share of ELEMENT_RATE lightings per heatSpots seconds is its weight over
        // the total, so the lightings add up to that rate whatever the sizes and positions. The
        // first wait is a random fraction of the usual one, as if the lamp had been running: with
        // every clock starting full the first lighting was the shortest of a dozen long waits
        // ("still taking forever before the first heater fires").
        if (el.next === 0) {
          const wait = heatSpots / ELEMENT_RATE * weight / el.weight
          el.next = heaterTime + wait * (el.fresh ? randomRange(0, 1) : randomRange(0.5, 1.5))
          el.fresh = false
        }
        if (heaterTime >= el.next) {
          el.heat = randomRange(...ELEMENT_HEAT)
          el.start = heaterTime
          let lifeScale = el.lifeScale || 1
          if (ELEMENTS_ARE_CUPS) {
            // This lighting's core: narrow to the whole cup, leaning narrow; wider burns shorter.
            const u = random()
            el.coreFraction = el.coreMin + (el.cupHalf - el.coreMin) * u * u
            lifeScale = Math.max(1, lifeScale * el.coreMin / el.coreFraction)
          }
          el.life = randomRange(...ELEMENT_LIFE) * lifeScale
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
      el.halfWidth = ELEMENTS_ARE_CUPS ? el.coreFraction * width : el.radius * ELEMENT_ASPECT
      el.glow = el.heat > 0 ? Math.sin(Math.PI * (heaterTime - el.start) / el.life) : 0
      if (el.glow > 0 && el.radius * 2 > maxReach) maxReach = el.radius * 2
    }
    const powerAt = x => {
      if (progress >= 1) {
        if (heatSpots <= 0) return 1
        let power = SPOT_BASE
        for (const el of elements) {
          if (el.glow <= 0) continue
          const d = (x - el.x) / el.halfWidth
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
        const dx = (px - el.x) * el.radius / el.halfWidth
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
      temp[i] = nextTemperature(temp[i], y[i], height, maxTemp, particleSize, powerAt(x[i]), HEAT_IN_CUPS && cupDepthNow > 0 ? floorAt(x[i]) : height)
      if (maxReach > 0 && y[i] > elementReach && (HEAT_IN_CUPS || ELEMENTS_ARE_CUPS || y[i] <= height)) {
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

    const { g, shared, home } = state
    for (let i = 0; i < alive; i++) {
      const neighbours = findNeighbours(state, hash, i, interactionRadius)
      updatePressure(state, i, neighbours, stiffness, stiffnessNear, restDensity)
      let weight = 0
      let heat = 0
      for (let k = 0; k < neighbours.length; k++) {
        const n = neighbours[k]
        // Heat crossing from one bottle to another goes through glass: GLASS_CONDUCTION of the
        // usual (Robert: "the blobs can still share heat if they're close enough in the bottles,
        // which is kinda good because it makes neighbor bottles interact and drop together, but i
        // think we should model this intentionally and make the heat conduction less effective
        // if it's crossing between bottles"). Through a mouth it is full.
        const w = home[i] >= 0 && home[n] >= 0 && home[i] !== home[n] ? g[n] * GLASS_CONDUCTION : g[n]
        weight += w
        heat += w * temp[n]
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
    if (ELEMENTS_ARE_CUPS) {
      if (floorCups.length === 0) layoutCups(floorCups, true)
      const shorter = Math.min(width, height)
      const smallest = CUP_WIDTH_RANGE[0] * shorter
      for (const cup of floorCups) {
        const fx = Math.max(0.02, Math.min(0.98, cup.fx))
        // Vertical reach as a fraction of the shorter side: the bottle's neck and bulb.
        const fr = Math.max(0.03, ((FLOOR_NECK[0] + (FLOOR_NECK[1] - FLOOR_NECK[0]) * cup.fn) * shorter + FLOOR_BULB * cup.fw * width) / shorter)
        const d = (fx - 0.5) / SPOT_SPREAD
        const weight = (0.25 + 0.75 * Math.exp(-d * d / 2)) * ELEMENT_RADIUS[0] / Math.max(ELEMENT_RADIUS[0], fr)
        const cupWidth = cup.fw * width
        const core = Math.min(cupWidth / 2, ELEMENT_CORE * shorter)
        const lifeScale = Math.min(ELEMENT_LIFE_SCALE, (cupWidth * cupWidth) / (smallest * smallest))
        elements.push({ fx, fr, weight, cupHalf: cup.fw / 2, coreMin: core / width, coreFraction: core / width, lifeScale, heat: 0, start: 0, life: 0, next: 0, fresh: true, x: 0, radius: 0, halfWidth: 0, glow: 0 })
      }
      return
    }
    const count = Math.max(2, Math.round(width / ELEMENT_GAP))
    for (let k = 0; k < count; k++) {
      const fx = (k + 0.5 + randomRange(-0.4, 0.4)) / count
      const fr = ELEMENT_RADIUS[0] + (ELEMENT_RADIUS[1] - ELEMENT_RADIUS[0]) * Math.pow(random(), ELEMENT_SIZE_SKEW)
      // How often it lights, relative to the others: small rings more than big ones, and ones near
      // the middle more than ones by the walls (the same lean as the old heat spots).
      const d = (fx - 0.5) / SPOT_SPREAD
      const weight = (0.25 + 0.75 * Math.exp(-d * d / 2)) * ELEMENT_RADIUS[0] / fr
      elements.push({ fx, fr, weight, heat: 0, start: 0, life: 0, next: 0, fresh: true, x: 0, radius: 0, halfWidth: 0, glow: 0 })
    }
  }

  // The heating elements, { x, radius, halfWidth, glow } in px and 0 to 1, for the heater view.
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
    if (cupDepthNow > 0) {
      if (y[i] > height) containIn(floorBottleList(), i)
      else if (y[i] < CUP_LIP * Math.min(width, height)) containIn(ceilingBottleList(), i)
      else state.home[i] = -1
    } else {
      if (y[i] < 0) y[i] = 0
      else if (y[i] > height) y[i] = height
    }
  }

  // Lay the cups across the ceiling once (see CUP_WIDTH): bell curve widths, then all scaled so
  // they tile the width exactly. Fractions, so a resize keeps the same lamp.
  // With `onWalls` the end cups are centred on the walls, so the corners are the deepest points:
  // the floor's cups are laid out that way, because with rims at the walls the corner was the
  // highest point of the floor, the convection roll brings lava down the walls to exactly there,
  // and it piled up ("we got significant wall climbing back").
  function layoutCups (into = cups, onWalls = false) {
    const shorter = Math.min(width, height)
    const widths = []
    let total = 0
    while (total < width + (onWalls ? CUP_WIDTH_RANGE[1] * shorter : 0)) {
      let w = (CUP_WIDTH[0] + randomNormal() * CUP_WIDTH[1]) * shorter
      w = Math.max(CUP_WIDTH_RANGE[0] * shorter, Math.min(CUP_WIDTH_RANGE[1] * shorter, w))
      widths.push(w)
      total += w
    }
    if (onWalls) {
      // Centres at 0 and the width: the span from the first centre to the last is half the first
      // and last widths plus all the middle ones, scaled to the width.
      if (widths.length < 2) widths.push(widths[0])
      let span = widths[0] / 2 + widths[widths.length - 1] / 2
      for (let k = 1; k < widths.length - 1; k++) span += widths[k]
      const k = width / span
      let centre = 0
      for (let i = 0; i < widths.length; i++) {
        const w = widths[i] * k
        if (i > 0) centre += widths[i - 1] * k / 2 + w / 2
        into.push({ fx: centre / width, fw: w / width, fn: random(), shape: drawShape() })
      }
      return
    }
    let at = 0
    for (const w of widths) {
      const fw = w / total
      into.push({ fx: at + fw / 2, fw, fn: random(), shape: drawShape() })
      at += fw
    }
  }

  // A bulb's shape: the kind and its random numbers, as fractions, drawn once per bottle.
  function drawShape () {
    const kind = BULB_SHAPES[Math.floor(random() * BULB_SHAPES.length)]
    const shape = { kind, n: 5 + Math.floor(random() * 4), amp: randomRange(0.18, 0.32), phase: random() * Math.PI * 2, waves: [], spikes: [] }
    if (kind === 'cloud') { shape.n = 3 + Math.floor(random() * 3); shape.amp = randomRange(0.22, 0.38) }
    if (kind === 'ooze' || kind === 'splat') {
      for (let k = 0; k < 3; k++) shape.waves.push({ f: 1 + Math.floor(random() * 3), a: randomRange(0.05, 0.14), p: random() * Math.PI * 2 })
    }
    if (kind === 'splat') {
      const count = 2 + Math.floor(random() * 3)
      for (let k = 0; k < count; k++) shape.spikes.push({ at: random() * Math.PI * 2, a: randomRange(0.3, 0.55), w: randomRange(0.12, 0.22) })
    }
    return shape
  }

  // The bulb's radius factor at angle `theta` (canvas angles, clockwise from +x), 1 on a circle.
  // `mouth` is the angle toward the mouth; the shape fades to nothing within SHAPE_SMOOTH of it.
  function shapeFactor (shape, theta, mouth) {
    let away = Math.abs(theta - mouth) % (Math.PI * 2)
    if (away > Math.PI) away = Math.PI * 2 - away
    const lo = SHAPE_SMOOTH * Math.PI / 180
    const hi = SHAPE_FULL * Math.PI / 180
    const t = Math.max(0, Math.min(1, (away - lo) / (hi - lo)))
    const fade = t * t * (3 - 2 * t)
    if (fade <= 0 || shape.kind === 'round') return 1
    let bump = 0
    if (shape.kind === 'star') bump = shape.amp * Math.cos(shape.n * theta + shape.phase)
    else if (shape.kind === 'cloud') bump = shape.amp * Math.pow(Math.abs(Math.sin(shape.n * theta / 2 + shape.phase)), 0.6)
    else {
      for (const w of shape.waves) bump += w.a * Math.sin(w.f * theta + w.p)
      for (const sp of shape.spikes) {
        let d = Math.abs(theta - sp.at) % (Math.PI * 2)
        if (d > Math.PI) d = Math.PI * 2 - d
        bump += sp.a * Math.exp(-(d * d) / (sp.w * sp.w))
      }
    }
    return 1 + bump * fade
  }

  // A bottle, in px: a mouth of half width w in the line at lineY (the lip for the ceiling, the
  // bottom edge for the floor), a neck to neckEnd in direction dir (-1 up, +1 down), and a bulb
  // of radius R centred at cy that meets the neck where its width is the mouth's. The neck flares
  // into the mouth and into the bulb on quarter circles of radius r (see BOTTLE_ROUND).
  function bottlesFor (row, lineY, dir, bulbShare, neckRange) {
    const shorter = Math.min(width, height)
    const out = []
    if (cupDepthNow <= 0) return out
    for (const cup of row) {
      const a = cup.fw * width / 2
      const R = a * cupDepthNow * bulbShare
      // The mouth is BOTTLE_MOUTH of the bulb's radius (for the ceiling that is the cup's half
      // width); measured against the cup it came out wider than the floor's smaller bulbs, the
      // neck joined near the bulb's equator and the circle poked up through the floor line
      // (Robert: "bottles on the bottom look a bit fucked up").
      const w = BOTTLE_MOUTH * Math.min(a, R)
      const neck = (neckRange[0] + (neckRange[1] - neckRange[0]) * cup.fn) * shorter
      const rm = Math.min(BOTTLE_ROUND * w, neck / 2) // the mouth fillet
      const rs = BOTTLE_ROUND * w // the shoulder fillet
      const yf = lineY + dir * neck // where the straight wall ends and the shoulder begins
      // The shoulder fillet's centre is w + rs out from the axis at yf; the bulb's centre sits
      // R + rs from it, straight on, so the fillet is tangent to both wall and bulb. The neck
      // ends (and the bulb begins) at the tangent point.
      const L = R + rs
      const H = w + rs
      const drop = Math.sqrt(Math.max(0, L * L - H * H))
      const cy = yf + dir * drop
      const neckEnd = yf + dir * rs * drop / L
      const joinAngle = Math.asin(Math.min(1, H / L)) // from the mouth direction to the tangent point
      // The mouth is straight down from a ceiling bulb's centre (canvas angle +90 degrees) and
      // straight up from a floor bulb's (-90). The bulb's outline is R times the shape factor.
      const mouth = dir < 0 ? Math.PI / 2 : -Math.PI / 2
      const shape = cup.shape || { kind: 'round' }
      const radiusAt = theta => R * shapeFactor(shape, theta, mouth)
      out.push({ cx: cup.fx * width, lineY, dir, w, rm, rs, yf, neckEnd, cy, R, joinAngle, reach: R * 1.6, radiusAt, kind: shape.kind })
    }
    return out
  }
  // Area by sampling the outline (shapes are not circles).
  function bottleArea (b) {
    if (b.area === undefined) {
      let sum = 0
      const n = 72
      for (let k = 0; k < n; k++) { const rr = b.radiusAt(k / n * Math.PI * 2); sum += rr * rr }
      b.area = Math.PI * sum / n + 2 * b.w * Math.abs(b.neckEnd - b.lineY)
    }
    return b.area
  }
  // The neck's half width at a height: the mouth's, plus the mouth fillet near the line and the
  // shoulder fillet past yf, where the wall curves out to meet the bulb.
  function neckHalf (b, py) {
    const t = Math.abs(py - b.lineY)
    const mouth = t < b.rm ? b.rm - Math.sqrt(Math.max(0, b.rm * b.rm - (b.rm - t) * (b.rm - t))) : 0
    const u = (py - b.yf) * b.dir
    const shoulder = u > 0 ? b.rs - Math.sqrt(Math.max(0, b.rs * b.rs - Math.min(u, b.rs) * Math.min(u, b.rs))) : 0
    return b.w + mouth + shoulder
  }
  let ceilingCache = null
  let floorCache = null
  let bottleKey = ''
  function refreshBottles () {
    const key = `${width}/${height}/${cupDepthNow}/${cups.length}/${floorCups.length}`
    if (key === bottleKey) return
    bottleKey = key
    ceilingCache = bottlesFor(cups, CUP_LIP * Math.min(width, height), -1, 1, BOTTLE_NECK)
    floorCache = bottlesFor(floorCups, height, 1, FLOOR_BULB, FLOOR_NECK)
  }
  function ceilingBottleList () { refreshBottles(); return ceilingCache }
  function floorBottleList () { refreshBottles(); return floorCache }

  // Is the point inside this bottle's neck or bulb?
  function insideBottle (b, px, py) {
    const dx = px - b.cx
    if ((py - b.neckEnd) * b.dir <= 0 && (py - b.lineY) * b.dir >= 0 && Math.abs(dx) <= neckHalf(b, py)) return true
    const dy = py - b.cy
    const rr = b.radiusAt(Math.atan2(dy, dx))
    return dx * dx + dy * dy <= rr * rr
  }

  // Keep a particle that has crossed a line inside one bottle of that row: the one it entered
  // through the mouth, remembered in state.home, so lava never passes from bottle to bottle even
  // where two bulbs overlap on the drawing ("one bottle got a lot of filling and the lava
  // quantum tunnels to another bottle" was the nearest-surface rule moving a particle nudged
  // out of its bottle into a neighbour whose rim was closer). A particle arriving at the line
  // under no mouth is held at the line; one in its bottle but out of place is moved the shortest
  // way back in, sideways into the neck or in to the bulb's rim.
  function containIn (list, i) {
    const { x, y, home } = state
    if (!list.length) return
    const lineY = list[0].lineY
    const dir = list[0].dir
    if ((y[i] - lineY) * dir <= 0) { home[i] = -1; return }
    let k = home[i]
    if (k < 0 || k >= list.length) {
      // Entering: which mouth is it under?
      k = -1
      for (let j = 0; j < list.length; j++) if (Math.abs(x[i] - list[j].cx) <= neckHalf(list[j], lineY)) { k = j; break }
      if (k < 0) { y[i] = lineY; return }
      home[i] = k
    }
    const b = list[k]
    if (insideBottle(b, x[i], y[i])) return
    const dx = x[i] - b.cx
    const dy = y[i] - b.cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const rim = b.radiusAt(Math.atan2(dy, dx)) // the outline along this ray
    let bestD = Math.abs(y[i] - lineY)
    let bestX = x[i]
    let bestY = lineY
    if ((y[i] - b.neckEnd) * dir <= 0) {
      // In the neck's span but outside its walls. In a flared corner, the wall is a quarter
      // circle: push out from that circle's centre along its radius, which is the wall's normal.
      // Pushing sideways there made a particle in the corner flip between "sideways into the
      // neck" and "back to the line" from step to step (Robert: "they do this anxious jiggle
      // thing at the bottle tops").
      const side = Math.sign(dx || 1)
      const fromLine = Math.abs(y[i] - lineY)
      const pastShoulder = (y[i] - b.yf) * dir
      let nx = b.cx + side * b.w
      let ny = y[i]
      let valid = true
      const rc = fromLine < b.rm ? b.rm : pastShoulder > 0 ? b.rs : 0
      if (rc > 0 && Math.abs(dx) <= b.w + rc) {
        // In a fillet: push out from the fillet circle's centre along its radius, the wall's
        // normal. The rim is the wall only inside the fillet's own square; a point past the
        // square is in the lip, and goes to the line instead.
        const ccx = b.cx + side * (b.w + rc)
        const ccy = fromLine < b.rm ? lineY + dir * b.rm : b.yf
        const ex = x[i] - ccx
        const ey = y[i] - ccy
        const e = Math.sqrt(ex * ex + ey * ey) || 1
        nx = ccx + ex / e * rc
        ny = ccy + ey / e * rc
        if (Math.abs(nx - b.cx) > b.w + rc + 0.01 || (ny - lineY) * dir < -0.01 || (ny - b.neckEnd) * dir > 0.01) valid = false
      } else if (Math.abs(dx) > b.w + rc) {
        valid = false
      }
      if (valid) {
        const d = Math.hypot(nx - x[i], ny - y[i])
        if (d < bestD) { bestD = d; bestX = nx; bestY = ny }
      }
    }
    if (dist > 0 && dist - rim < bestD) { bestD = dist - rim; bestX = b.cx + dx / dist * rim; bestY = b.cy + dy / dist * rim }
    x[i] = bestX
    y[i] = bestY
    if (bestY === lineY && bestX === x[i]) home[i] = -1
  }

  const cupAt = (row, px) => {
    const f = Math.max(0, Math.min(1, px / width))
    for (const c of row) if (f <= c.fx + c.fw / 2) return c
    return row[row.length - 1]
  }

  // The lamp's extent above and below the screen at a point, for the Cups view: the far side of
  // any bottle whose bulb spans it, else the line. Positive is down.
  function ceilingAt (px) {
    const list = ceilingBottleList()
    let top = list.length ? list[0].lineY : 0
    for (const b of list) if (Math.abs(px - b.cx) <= b.reach) top = Math.min(top, b.cy - b.reach)
    return top
  }

  function floorAt (px) {
    const list = floorBottleList()
    let bottom = height
    for (const b of list) if (Math.abs(px - b.cx) <= b.reach) bottom = Math.max(bottom, b.cy + b.reach)
    return bottom
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
    floorAt,
    bottles: ceilingBottleList,
    floorBottles: floorBottleList,
    get state () { return state },
    get count () { return alive },
    get width () { return width },
    get height () { return height }
  }
}
