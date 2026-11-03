import { SpatialHash } from './spatialHash.js'
import { RELAX_CAP, findNeighbours, relax, reuseNeighbours, updatePressure, viscosity } from './fluid.js'
import { nextTemperature } from './heat.js'
import { random, randomBetween, randomNormal, randomRange } from './random.js'

// The spatial hash's cell is the interaction radius, so a neighbour query touches nine cells of
// the right size whatever the radius. It was a fixed 50 px, tuned for the lamp's radius 60: at
// Robert's fine grained radius 8 every query then swept up to four 50 px cells of a packed pool,
// hundreds of candidates for 35 neighbours, and findNeighbours was two thirds of a 52 ms step at
// 6000 particles. Never below MIN_CELL, or the grid itself gets huge and clearing it is the cost.
const MIN_CELL = 8
const WALL_CONTACT = 2 // px: a particle this close to a side wall is in contact with it
const WALL_PUSH_RATE = 2 // px/s of velocity away from the wall per px inside the wallPush margin, per step
const RELAX_REACH = Infinity // the most a relaxation step may move a particle, in interaction radii (params.reach); the lamp runs uncapped
const CELL_FRACTION = 0.75 // cell size as a fraction of the radius: smaller cells mean fewer candidates but more cells to walk; 0.75 measured best for the lamp (6.7 ms against 7.8 at 1 and 7.5 at 0.5)
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
const ELEMENT_HEAT = [3, 8] // temperature per step at the core; the finger gives 12. Was 2 to 6 with the cups (at 4 to 12 an element fired a stream of small globs); the bottles hold twice the cold mass
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
const ELEMENT_RATE = 4 // was 3 with the cups; the bottles hold twice the cold mass
const SPOT_SPREAD = 0.2
const SPOT_BASE = 0.2 // the floor's contact heat with nothing lit, of normal power (params.floorHeat)
const SPOT_GLOW = 2 // how much brighter the floor is under a lit element at full glow (params.floorGlow)
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
// Robert: "the variance in size is not significant enough. we need random normal here so we get
// a couple tiny bottles and one or two giant bottles. I think we can also not overlap the bottles
// since we have the bottle locking mechanism and conduction resolved between bottles. This
// should allow for more variance in placement too since we can put a few bottles right next to
// each other and occasionally have largish gaps". Widths from a wide bell curve, bottles laid
// side by side, with gaps drawn from an exponential: mostly a sliver, now and then wide. Only the
// mouths are kept apart; the bulbs may overlap, since each particle is locked to its own bottle
// and conduction between bottles is through glass (Robert: "we need just generally more pots,
// don't forget they can overlap. Imagine they're on a diagonal line in 3 dimensions, that would
// allow for the overlap in a real one"). The smallest were too small ("the small ones are too
// small"): the range starts at 0.14 of the shorter side.
const CUP_WIDTH = [0.2, 0.1] // mean, deviation, of the shorter side
const CUP_WIDTH_RANGE = [0.14, 0.6]
const CUP_GAP = 0.02 // mean gap between mouths, of the shorter side
// The lip was 4% of the shorter side below the top edge, which left a black bar above the lava
// (Robert: "The bottles at the top should be exactly at the top of the screen instead of
// protruding so they don't cause this black bar"); the mouths are in the top edge itself now.
const CUP_LIP = 0
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
// Half what they were ([0.05, 0.4]); Robert, 2026-10-31, with the reservoirs on the GPU: "let's
// make the necks on the bottles on the top about 1/2 as long so that it spills over more often".
const BOTTLE_NECK = [0.025, 0.2]
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
const FLOOR_NECK = [0, 0] // the floor's bottles have no necks: open bulbs under the floor (Robert: "on the bottom bottles we should not have any bottle necks. This will encourage a bit more interaction between the bottles"); they were 5% to 18% of the shorter side
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
const OUTLINE_POINTS = 120 // the bulb outline as a polygon, for nearest point projection
const SHAPE_SMOOTH = 60
const SHAPE_FULL = 120
// How well heat conducts between lava in two different bottles, as a share of the usual.
const GLASS_CONDUCTION = 0.3
// How much of the pressure step's displacement, as a velocity, a particle keeps when Wobble is on,
// and the most speed it may carry, in gravities: kicks of several px a step add up to thousands
// of px a second otherwise (90th percentile 2900 px/s at a kick of 1).
const WOBBLE_KICK = 1 // was 0.3: "a bit subtle. I'd expect more snapping especially when big blobs interact"
const WOBBLE_MAX = 2 // was 1
// Robert: "the heater... should it like, be the cup? Like should there just be one heater that
// heats the whole cup?" With this on, the heating elements are the floor cups themselves: one
// per cup, centred on it, as wide as the cup and reaching as far above the bottom edge as the
// cup goes below it, lit on the same clocks, and heating the lava hidden in the cup as well as
// the lava above it, so a whole cup's worth warms together.
const ELEMENTS_ARE_CUPS = true
// Lift: the most buoyancy a particle may carry, in gravities. Past it a hot particle at the
// line (Element 69, Max Temp 25038 on Robert's CPU link) left the liquid alone at three and a
// half gravities, a spray of single dots. 10 is no cap; params.liftCap, the Lift knob.
const LIFT_CAP = 10
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
const ELEMENT_CORE = 0.1 // params.elementCore
const ELEMENT_LIFE_SCALE = 4 // params.elementLifeScale
// Robert, with the lamp beside the video of a real one: "the heaters get too hot for too long.
// We need some knobs to tweak the heater pulses and heat and such." So the heater's numbers are
// params as well as constants: elementRate (lightings per Heat interval), elementLifeScale (how
// much longer the biggest pot burns than the smallest), elementCore (a lit pot's core width),
// floorHeat (the floor's idle contact heat) and floorGlow (the floor's boost under a lit pot),
// beside the Element heat and Burn life that already were.
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
// Stirring overrides inertia. Where a finger or a strong eddy is at work the carried velocity is
// replaced by the buoyancy drift (the Wobble 0 lamp, which is where the fingers and the tornadoes
// were tuned) and the stirring moves the lava on top of that. Without this the pool's skin fought
// every finger: the particles at a pushed hole's edge, and across the raised surface around it,
// read as skin, their moves back were carried six times over at up to Cap gravities (2200 px/s
// against the finger's 250), and a push held two seconds in the cold pool changed nothing; with
// the kick off, 70% of the lava under the finger was gone. Fading the kick alone, by the local
// stirring speed (0 to 21%) or by the finger's weight however wide (15 to 24%), was not enough:
// the recoil arrives from the whole surface. A finger's override follows its weight: `finger`
// times exp(-q^2), full to q 1.2, gone by 2.5. An eddy overrides where it is fast (its local speed
// over `speed` px/s) and only when it is strong: its peak speed between `peak`. The defaults
// (drifter cores up to 146 px/s, stationary eddies 45) sit at the bottom of that range, so the
// lamp at rest is close to untouched; at the top of the Turbulence slider (drifters 375 px/s) the
// tornadoes win. One mutable object so a lab or the console can tune it live.
export const STIR_OVERRIDE = { finger: 4, speed: 100, peak: [120, 240] }
// Turbulence: now and then an eddy appears at a random spot, a slow vortex that fades in and out
// over a few seconds, spinning either way. Each is a Gaussian vortex, so it is divergence free
// and moves the lava around without squashing it. The gap between eddies, their size and their
// life are drawn from these ranges; `turbulence` in params is the peak speed in px/s.
const EDDY_RADIUS = [0.15, 0.3] // of the shorter side of the lamp
const EDDY_LIFE = [4, 10] // seconds
const EDDY_PEAK = 0.4289 // peak of r e^(-r^2), to scale the field to its stated speed
// Drifting eddies: the same vortex, but born with a velocity, bouncing off the walls and floor
// and dying away over its life instead of fading in and out in place. `drifters` in params is
// how many are alive at once; a new one is born a few seconds after one dies.
// Robert, 2026-11-02, after finding that the eddies crushed the pool ("the eddies compressing
// the liquid"): "we should restrict the eddies effect across a gradient on the lower part of the
// lamp... all eddies spawn from anywhere on the edges then follow inverse logarithm movement
// speed (starts fast, slows down quickly, then sorta hobbles along)... the rotation force
// should follow an inverse exponential curve (it should run fairly strongly, then drop off
// quick)... The path of each eddy should be affected by the other eddies." So: a drifter is born
// on a random edge heading inward, travels at the Speed knob falling off by the Curve knob at the
// Fall off rate (travelPace below; the log curve at 1.5 gives 120, 59, 33, 22 px/s), spins at full
// for half a second then as exp(-age / (DRIFT_SPIN_TAU life)), and is carried by the other
// eddies' flow at its position times DRIFT_ADVECT. Every eddy's push fades with depth: full
// above EDDY_DEPTH_FADE[0] of the height, down to EDDY_DEPTH_FADE[1] of itself at the floor, so
// the pool is skimmed from the top rather than squashed.
// The travel is three knobs now (params.eddySpeed px/s at birth, times DRIFT_VARIETY;
// eddyFalloff the rate; eddyCurve log, linear or exp): first 150 to 300 slowing as
// 1 + 3 ln(1 + age), then 80 to 160 over 1 + 1.5 ln(1 + age), and Robert still: "they're
// still slowing down too much I think, and starting too fast. Can I get knobs for the motion?"
// The curves keep a floor of TRAVEL_FLOOR of the birth speed, so an eddy always hobbles.
const TRAVEL_FLOOR = 0.15
const DRIFT_SPIN_TAU = 0.3 // of the life
const DRIFT_FADE_OUT = 0.35 // the last share of the life over which the spin tapers smoothly to nothing
const DRIFT_ADVECT = 1
const EDDY_DEPTH_FADE = [0.6, 0.05] // [unused since the fade follows the pool, what is left at the pool's surface]
const EDDY_FADE_SPAN = 0.15 // of the height above the lava's rest level over which an eddy fades
const DRIFT_LIFE = [12, 30] // seconds
const DRIFT_GAP = [2, 6] // seconds before the first birth
const DRIFT_GAP_MEAN = 5 // seconds between birth bursts at the middle of the log normal; see driftGap
const DRIFT_BURST_ALL = 0.15 // the chance a birth brings every missing eddy at once
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
//   particleCount, interactionRadius, stiffness, stiffnessNear, restDensity, maxTemp, gravity, particleSize, stir, conduction, turbulence, drifters, heatSpots, cupDepth, wobble, wobbleKick, wobbleMax, heater, touchHeat, touchRadius (px, 0 for the lamp's fraction of its size), settle, viscosity, reach (radii), wallPush (px), kickBelow (fraction of mean density, 0 for pressure below zero), share (the neighbour's share of each relaxation move, 0.1 as tuned, 1 reciprocal), elementHeat (a lit element's heat per step at its core, the top of its range; the bottom is 3/8 of it), elementLife (seconds a lighting burns, the top of its range; the bottom a third), elementRate, elementLifeScale, elementCore, floorHeat, floorGlow (see SPOT_BASE and ELEMENT_CORE), worldOnly (no lava: the world alone, for the GPU lamp's shell)
export function createSimulation ({ width, height, params }) {
  const hash = new SpatialHash(width, height, Math.max(MIN_CELL, params.interactionRadius * CELL_FRACTION))
  const impulse = [0, 0]
  let state = allocate(params.particleCount)
  // Each particle's neighbours from the pressure pass, flat: nbStart[i] to nbStart[i + 1] in nbList.
  let nbList = new Int32Array(params.particleCount * 16)
  let nbStart = new Int32Array(params.particleCount)
  let nbEnd = new Int32Array(params.particleCount)
  // Scratch for sorting the particle arrays into cell order (see reorder).
  let scratchF = new Float32Array(params.particleCount)
  let scratchI = new Int16Array(params.particleCount)
  let scratchId = new Int32Array(params.particleCount)
  let visit = new Int32Array(0) // the order the relaxation visits the particles in this step
  let visitSeed = 12345 // the visiting order's own little generator, so the lamp's seeded randomness is untouched
  // The live count follows params.particleCount; particles added later appear in the slab too.
  let alive = 0
  let nextId = 0 // birth index of the next particle spawned: never reused, so an id names one particle for the lamp's life
  let heaterTime = 0
  let lightRequests = 0 // pots asked to light on demand (the music's beat), taken at the next step
  // The drop (Robert: "pick the biggest pot that's cold, get it preheated to the point just before
  // it takes off, then blast the heat on the drop"; then "could we even like, close the pot and
  // super heat it? then just delete the lid and have it take of instantly?"). While the music is
  // in a breakdown or an intro, chargePot(level) puts a lid on the biggest cold pot and heats it
  // at level times the top element heat, the whole cup, for as long as it lasts: nothing leaves
  // and nothing comes in, so it can be as hot as it likes with no early takeoff. dropPot(strength)
  // takes the lid off and blasts that pot (or the biggest cold one, if none was charged) at
  // DROP_BLAST times the top heat times strength, full on for half of DROP_LIFE and tapering over
  // the rest. lidPot is the lidded pot's index, -1 for none, which contain honours.
  let chargeLevel = 0
  let chargeBig = false // the drop's pot (the biggest cold, the whole cup), else a beat's pot (drawn as the clocks draw them, their usual core)
  let charged = null
  let lidPot = -1
  let dropRequest = 0
  // A vent: the lid lifted for a moment, so the top of the charged pot's lava puffs out and the
  // pot closes again and goes on charging (Robert: "what if we occasionally pulse the pre heated
  // pots to release pulses of heat to match the music"). Lava that rises past the floor's line
  // belongs to the pool from then on, so the lid coming back does not pull it in again.
  let ventUntil = -1
  let ventRequest = 0
  const DROP_BLAST = 3
  // The lidded pot heats to CHARGE_LIFT gravities and no further (the drift up is temperature
  // over gravity, capped at Lift gravities, so the cap is also never past full lift). Uncapped,
  // four lids in 32 s took their lava to Max Temp, which cools so slowly it parked white in the
  // ceiling bottles and drained the pool and the pots; three quarters of Max Temp still did.
  // Full lift alone was no cap at the default Lift (10 gravities, 7909 against Max Temp 7232).
  // Each pot's cap is its capTemp, set every step, for the blast at the opening too: uncapped it took
  // the opened pot's lava to 4433 and half the lamp's lava ended in the ceiling bottles by 28 s
  // (Drop 0: 10 to 20%).
  const CHARGE_LIFT = 3 // the drop's pot
  const CHARGE_LIFT_BEAT = 2 // a beat's pot: at 3 its lava parked in the ceiling bottles at 1200 against 850 with no lids, and the ceiling held 59% of the lava by 40 s
  const DROP_LIFE = 2 // seconds
  let eddyRequests = 0 // eddies asked for on demand (the music's beat), born at the next step if there is room
  // The music's bass, on the eddies ("bass notes should cause a wave"). The spring that went with
  // it, the lava about every eddy lurched forward along its spin and back, is gone (Robert: "the
  // eddies doing the back and forth looks bad. let's remove that and only keep the pulse
  // version"). A hit may send a pulse: a ring from an eddy's centre (or a point above the pool) travelling
  // out at PULSE_SPEED, pushing the lava ahead of it out and the lava behind it back in, a
  // pressure wave with no net move, fading over its life.
  const pulses = []
  let pulseRequests = 0
  // The music's flips (Robert: "the eddies could abruptly switch directions up to one time during
  // their life time triggered by rareish music events"): each request is a chance that every eddy
  // not yet flipped turns its spin round, at once.
  const flipRequests = []
  // Slowed 4 times for a turn, read as the pulse Robert meant ("the pulse was sick... slow it down
  // like 4x or so"); he meant the vents, so the ring is as it was.
  const PULSE_SPEED = 260 // px/s
  const PULSE_WIDTH = 40 // px
  const PULSE_LIFE = 1.6 // s
  const PULSE_PX = 14 // how far the ring carries the lava at its peak
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
  let touchHeatNow = TOUCH_HEAT // params.touchHeat as of the last step
  let touchStrengthNow = 1 // params.touchStrength: a multiplier on every finger effect
  let touchRadiusNow = 0 // params.touchRadius as of the last step, px; 0 means the TOUCH_RADIUS fraction
  let wallPushNow = 0 // params.wallPush as of the last step, px
  let interactionRadiusNow = 20 // params.interactionRadius as of the last step, for the drop's lid
  let spawnAreaNow = params.spawnArea || SPAWN_AREA // floor area per settled particle, px², for the spawn slab and the reservoirs
  let meanDensity = 0 // the lava's mean density as of the last step, for the kick's surface test
  const eddies = []
  const drifting = []
  // No eddy for the first EDDY_FIRST seconds: the lava is still settling and the pots have not
  // fired, so the first eddy at Turb 600 drove straight into a flat cold pool (Robert: "the eddie
  // blast into the bottom is still too severe on startup").
  const EDDY_FIRST = 15 // Robert: "the first eddie should not fire until at least 15 seconds has passed" (lamp seconds: at Pace under 1 that is longer on the clock)
  let nextDrifter = EDDY_FIRST + randomRange(...DRIFT_GAP)
  // A log normal gap: the sum of three uniforms is near enough normal, scaled so the gap is
  // DRIFT_GAP_MEAN at the middle, about 2 s a standard deviation below it and 15 s above.
  const driftGap = () => { const z = (random() + random() + random() - 1.5) * 2; return DRIFT_GAP_MEAN * Math.exp(0.7 * z) }
  const carried = [0, 0] // scratch: the other eddies' flow at an eddy
  let startEase = 0 // the kick over the first second, 0 to 1, so the spawn's settling is not thrown into velocity
  // Where an eddy may be born on a side wall: above the lava's rest level by EDDY_CLEARANCE of
  // the height (Robert: "we only want to spawn eddies like at least 5% of the screen above where
  // the lava would rest. that should fix the weird pulse push down issue"). The rest level is
  // the spawn slab's: floor area per particle times the visible count over the width.
  const EDDY_CLEARANCE = 0.05
  // Where an eddy points at birth. From the top: down, within 60 degrees of straight down (it
  // may end in the pool). From a side: at most a graze downward (20 degrees), horizontal, or up
  // and away, the more so the nearer the lava it was born, since there is no reason to shoot up
  // from the top (Robert: "we should prevent eddies from being pointed directly into the
  // bottom... either end in the bottom (pointed down from the top or a high angle) or graze the
  // bottom at most (pointed horizontally). pointing up and away from the bottom is also allowed
  // as long as it's close enough to the bottom"). `low` is 0 at the top of the band, 1 at the
  // lava; the angle is in page terms, y down.
  const eddyHeading = (side, low) => {
    if (side === 0) return Math.PI / 2 + randomRange(-Math.PI / 3, Math.PI / 3)
    const tilt = randomRange(-20, 20 + 50 * low) * Math.PI / 180 // up is positive
    return side === 3 ? -tilt : Math.PI + tilt // from the left wall heading right, from the right wall heading left
  }
  const eddyCeilingY = () => {
    const restDepth = spawnAreaNow * Math.max(0, (params.particleCount || 0)) / width
    return Math.max(0, height - restDepth - EDDY_CLEARANCE * height)
  }
  // An eddy's travel speed at its age: its birth speed times the chosen fall off.
  const travelPace = (e, age) => {
    const k = params.eddyFalloff ?? 1.5
    const curve = params.eddyCurve || 'log'
    const f = curve === 'linear' ? 1 - k * age / 10 : curve === 'exp' ? Math.exp(-k * age / 5) : 1 / (1 + k * Math.log(1 + age))
    return e.speed * Math.max(TRAVEL_FLOOR, f)
  }
  // A drifter's spin over its life: half a second to spin up, then dying away exponentially.
  // The exponential alone still had 4% of the spin left at death and the eddy vanished with it
  // (Robert: "the eddies need to fade out more gracefully... it should gradually dissipate in
  // strength"), so the last DRIFT_FADE_OUT of the life is a smooth taper to nothing.
  const driftEnvelope = e => {
    const age = time - e.start
    const t = age / e.life
    const tail = t < 1 - DRIFT_FADE_OUT ? 1 : (() => { const u = Math.min(1, (1 - t) / DRIFT_FADE_OUT); return u * u * (3 - 2 * u) })()
    return Math.min(1, age / 0.5) * Math.exp(-age / (DRIFT_SPIN_TAU * e.life)) * tail
  }
  // The eddies' push fades with depth, so they skim the pool rather than squash it.
  // Measured on seed 787847212 after the start delay: the first eddy still dented the pool 54 px
  // with 308 px/s over it, because the fade was by fixed fractions of the height and the pool's
  // surface sat at 85% of it, where 43% of the push was left. Now the fade follows the pool:
  // full down to EDDY_FADE_SPAN of the height above the lava's rest level, EDDY_DEPTH_FADE[1] of
  // itself at the rest level and below.
  const poolSurface = () => height - spawnAreaNow * Math.max(0, params.particleCount || 0) / width
  // An eddy's centre never goes below the top of the fade band: one heading down glances off it
  // and runs along it, so it skims the pool instead of planting its core in it (the fade alone
  // still let 5% of a core of 1500 px/s through: a 69 px dent on seed 787847212).
  const eddyFloorY = () => poolSurface() - EDDY_FADE_SPAN * height
  const depthFade = py => {
    const surface = poolSurface()
    const top = surface - EDDY_FADE_SPAN * height
    if (py <= top) return 1
    const u = Math.min(1, (py - top) / (surface - top))
    return 1 + (EDDY_DEPTH_FADE[1] - 1) * u * u * (3 - 2 * u)
  }

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
      px: new Float32Array(count), // position after the drift move, before the pressure step (for the wobble kick)
      py: new Float32Array(count),
      home: new Int16Array(count).fill(-1), // the bottle a hidden particle is in, -1 for none
      id: new Int32Array(count) // the particle's birth index, kept through the cell order sort, so a particle can be followed
    }
  }

  // In the visible slab `depth` px above the bottom edge, or, with `hidden`, inside a floor
  // bottle (one picked by area, a point picked uniformly inside its bulb or neck).
  // The visible slab is a hexagonal lattice at the liquid's rest spacing, each particle jittered
  // a tenth of a spacing, so the lava starts where it would settle and the first passes have
  // nothing to do; thrown down at random it crossed itself and the whole pool jumped (Robert:
  // "there's a little explosion at start from the lava settling"). `slot` counts the visible
  // particles; the same two draws are spent as before, so the GPU lamp's spawn matches.
  function spawn (i, depth, hidden = false, slot = 0) {
    const list = hidden ? floorBottleList() : []
    state.home[i] = -1
    state.id[i] = nextId++
    const s = Math.sqrt(spawnAreaNow / 0.866)
    const cols = Math.max(1, Math.floor(width / s))
    const row = Math.floor(slot / cols)
    const col = slot % cols
    state.x[i] = ((col + 0.5 + 0.5 * (row & 1)) * (width / cols) + (random() - 0.5) * 0.2 * s + width) % width
    state.y[i] = height - (row + 0.5) * s * 0.866 + (random() - 0.5) * 0.2 * s
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
    startEase = Math.min(1, time)
    const bornEddy = () => {
      const radius = randomRange(...EDDY_RADIUS) * Math.min(width, height)
      // These too are born on an edge and travel inward, slowing as the drifters do (Robert,
      // seeing one appear mid lamp: "all eddies spawn from anywhere on the edges").
      const side = [0, 1, 3][Math.floor(random() * 3)] // never the floor
      const along = random()
      const heading = eddyHeading(side, side === 0 ? 0 : along)
      eddies.push({
        x: side === 1 ? width : side === 3 ? 0 : along * width,
        y: side === 0 ? 0 : along * eddyCeilingY(),
        speed: (params.eddySpeed ?? 120) * randomRange(...DRIFT_VARIETY),
        hx: Math.cos(heading),
        hy: Math.sin(heading),
        radius,
        spin: random() < 0.5 ? -1 : 1,
        start: time,
        life: randomRange(...EDDY_LIFE)
      })
    }
    const bornDrifter = () => {
      const core = randomRange(...DRIFT_CORE)
      const radius = Math.min(DRIFT_REACH * core, DRIFT_REACH_MAX * Math.min(width, height))
      const speed = (params.eddySpeed ?? 120) * randomRange(...DRIFT_VARIETY)
      // Born on the top or a side, never the floor where the lava sits (Robert: "eddies should
      // not be allowed to spawn on the bottom edge where the lava is"), heading inward within 60
      // degrees of straight in.
      const side = [0, 1, 3][Math.floor(random() * 3)]
      const along = random()
      const heading = eddyHeading(side, side === 0 ? 0 : along)
      drifting.push({
        x: side === 1 ? width - core : side === 3 ? core : core + along * (width - 2 * core),
        y: side === 0 ? core : core + along * Math.max(0, eddyCeilingY() - 2 * core),
        speed,
        hx: Math.cos(heading),
        hy: Math.sin(heading),
        vx: 0,
        vy: 0,
        core,
        radius,
        gain: DRIFT_GAIN * randomRange(...DRIFT_VARIETY),
        spin: random() < 0.5 ? -1 : 1,
        start: time,
        life: randomRange(...DRIFT_LIFE)
      })
    }
    // Births come in bursts at skewed gaps (Robert: "sometimes it should be quiet for 10 seconds
    // before an eddie spawns, then maximum it spawns all of the eddies at the same time across a
    // normal distribution with a lean toward less frequent"): the gap is log normal about
    // DRIFT_GAP_MEAN s (most 2 to 10, a tail to 15 and more); at a birth, one in DRIFT_BURST_ALL
    // times every missing eddy is born at once, otherwise a number leaning hard toward one.
    // The Eddies knob counts every eddy alive, the drifting tornadoes and the in-place vortices
    // both (Robert, at Eddies 2: "there was also frequently more than 2 spawned, I think I saw up
    // to 5"; the in-place ones had their own clock and no cap). Each birth is one kind or the
    // other at random.
    const alive = drifting.length + eddies.length
    // The flips first, so an eddy the music asks for in the same frame keeps its spin.
    while (flipRequests.length) {
      const chance = flipRequests.shift()
      for (const e of drifting) if (!e.flipped && random() < chance) { e.spin = -e.spin; e.flipped = true }
      for (const e of eddies) if (!e.flipped && random() < chance) { e.spin = -e.spin; e.flipped = true }
    }
    // The music asks for an eddy on its beat count: one is born now if the Eddies knob has room
    // (at least one, so a lamp at Eddies 0 still dances to music), whatever the birth clock says.
    while (eddyRequests > 0) {
      eddyRequests--
      if (drifting.length + eddies.length < Math.max(1, drifters) + 2) bornDrifter()
    }
    while (pulseRequests > 0) {
      pulseRequests--
      const from = drifting.length ? drifting[Math.floor(random() * drifting.length)] : null
      pulses.push({ x: from ? from.x : random() * width, y: from ? from.y : random() * eddyFloorY(), start: time })
    }
    for (let k = pulses.length - 1; k >= 0; k--) if (time - pulses[k].start > PULSE_LIFE) pulses.splice(k, 1)
    if (alive < drifters && time >= nextDrifter) {
      const missing = drifters - alive
      const burst = random() < DRIFT_BURST_ALL ? missing : 1 + Math.floor(random() * random() * missing)
      for (let b = 0; b < burst; b++) { if (random() < 0.5) bornDrifter(); else bornEddy() }
      nextDrifter = time + driftGap()
    }
    for (let k = drifting.length - 1; k >= 0; k--) {
      const e = drifting[k]
      if (time - e.start > e.life) {
        drifting.splice(k, 1)
        if (nextDrifter < time) nextDrifter = time + driftGap()
        continue
      }
      const pace = travelPace(e, time - e.start)
      eddyVelocity(e.x, e.y, Math.abs(turbulence), carried, e)
      e.vx = pace * e.hx + DRIFT_ADVECT * carried[0]
      e.vy = pace * e.hy + DRIFT_ADVECT * carried[1]
      e.x += e.vx * dt
      e.y += e.vy * dt
      const half = e.core
      if (e.x < half) { e.x = half; e.hx = Math.abs(e.hx) } else if (e.x > width - half) { e.x = width - half; e.hx = -Math.abs(e.hx) }
      const floorY = Math.min(height - half, eddyFloorY())
      if (e.y < half) { e.y = half; e.hy = Math.abs(e.hy) } else if (e.y > floorY) { e.y = floorY; e.hy = -0.3 * Math.abs(e.hy) }
    }
    while (drifting.length + eddies.length > drifters) { if (drifting.length) drifting.pop(); else eddies.pop() }
    for (let k = eddies.length - 1; k >= 0; k--) {
      const e = eddies[k]
      if (time - e.start > e.life) { eddies.splice(k, 1); continue }
      const pace = travelPace(e, time - e.start)
      e.x += pace * e.hx * dt
      e.y += pace * e.hy * dt
      if (e.x < 0) { e.x = 0; e.hx = Math.abs(e.hx) } else if (e.x > width) { e.x = width; e.hx = -Math.abs(e.hx) }
      const floorY = Math.min(height, eddyFloorY())
      if (e.y < 0) { e.y = 0; e.hy = Math.abs(e.hy) } else if (e.y > floorY) { e.y = floorY; e.hy = -0.3 * Math.abs(e.hy) }
    }
  }

  // The eddies' velocity at a point, written into `out`; `skip` leaves one drifter out (its own
  // flow is nothing to itself).
  function eddyVelocity (px, py, strength, out, skip = null) {
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
      if (e === skip) continue
      const dx = px - e.x
      const dy = py - e.y
      const r = Math.hypot(dx, dy)
      if (r === 0) continue
      const envelope = driftEnvelope(e)
      // Speed: rising linearly to the peak at the core's edge, then 2 r rc / (r^2 + rc^2),
      // which is one over distance in the tail, inside a Gaussian cutoff at the reach.
      const q = r / e.core
      const speed = e.gain * strength * envelope * 2 * q / (1 + q * q) * Math.exp(-(r * r) / (e.radius * e.radius))
      out[0] += -dy / r * speed * e.spin
      out[1] += dx / r * speed * e.spin
    }
    for (let k = 0; k < pulses.length; k++) {
      const w = pulses[k]
      const dx = px - w.x
      const dy = py - w.y
      const r = Math.hypot(dx, dy)
      if (r === 0) continue
      const age = time - w.start
      const u = (r - PULSE_SPEED * age) / PULSE_WIDTH
      if (u * u > 9) continue
      // The ring's speed: the derivative of a Gaussian, out ahead of the ring and in behind it.
      const v = -u * Math.exp(-u * u) * PULSE_PX * PULSE_SPEED / PULSE_WIDTH * 2.33 * (1 - age / PULSE_LIFE)
      out[0] += dx / r * v
      out[1] += dy / r * v
    }
    const fade = depthFade(py)
    out[0] *= fade
    out[1] *= fade
  }

  // How many particles the floor's reservoirs hold between them.
  function reserveFill () {
    let area = 0
    for (const b of floorBottleList()) area += bottleArea(b) * (b.cx <= 0 || b.cx >= width ? 0.5 : 1)
    const worth = Math.round(area / spawnAreaNow)
    // params.reserveCap: the pots hold at most this many times the visible lava (8 or more is no cap).
    const cap = params.reserveCap
    return cap > 0 && cap < 8 ? Math.min(worth, Math.round(cap * (params.particleCount || 0))) : worth
  }

  // Bring the live count to the target, all at once: the floor bottles' worth inside them and
  // the rest as a slab lying on the floor.
  function fill (target) {
    if (alive > target) alive = target
    if (alive === target) return
    const hidden = Math.min(target, reserveFill())
    const depth = Math.max(0, spawnAreaNow * (target - hidden) / width)
    const start = alive
    while (alive < target) {
      const i = alive++
      spawn(i, depth, i - start < hidden, Math.max(0, i - start - hidden))
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
    const radius = touchRadiusNow > 0 ? touchRadiusNow : Math.max(TOUCH_MIN, TOUCH_RADIUS * Math.min(width, height))
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
          out[0] += (TOUCH_PUSH * touchStrengthNow * ux + t.vx) * w
          out[1] += (TOUCH_PUSH * touchStrengthNow * uy + t.vy) * w
          break
        }
        case 'pull': {
          // Toward the finger, never past it.
          const speed = Math.min(TOUCH_PUSH * touchStrengthNow * w, r / dt)
          if (r > 0) {
            out[0] += -dx / r * speed + t.vx * w
            out[1] += -dy / r * speed + t.vy * w
          }
          break
        }
        case 'spin': {
          const core = radius * 0.5
          const c = r / core
          const speed = TOUCH_SPIN * touchStrengthNow * 2 * c / (1 + c * c) * Math.exp(-(q * q) / 4)
          if (r > 0) {
            out[0] += -dy / r * speed + t.vx * w
            out[1] += dx / r * speed + t.vy * w
          }
          break
        }
        case 'heat':
          heat += touchHeatNow * touchStrengthNow * w
          break
        case 'cool':
          heat -= touchHeatNow * touchStrengthNow * w
          break
      }
    }
    return heat
  }

  // The strength gate of an eddy with this peak speed, 0 to 1 (see STIR_OVERRIDE.peak).
  function overrideGate (peak) {
    return Math.min(1, Math.max(0, (peak - STIR_OVERRIDE.peak[0]) / (STIR_OVERRIDE.peak[1] - STIR_OVERRIDE.peak[0])))
  }

  // Whether any eddy is strong enough to override at all this step.
  function overrideActive () {
    const strength = Math.abs(params.turbulence || 0)
    if (strength === 0) return false
    for (const e of eddies) if (overrideGate(strength * Math.sin(Math.PI * (time - e.start) / e.life)) > 0) return true
    for (const e of drifting) { if (overrideGate(e.gain * strength * driftEnvelope(e)) > 0) return true }
    return false
  }

  // How much the eddies at a point override the inertia, 0 to 1 (see STIR_OVERRIDE.peak).
  function overrideAt (px, py) {
    const strength = Math.abs(params.turbulence || 0)
    if (strength === 0) return 0
    let fade = 0
    for (let k = 0; k < eddies.length && fade < 1; k++) {
      const e = eddies[k]
      const dx = (px - e.x) / e.radius
      const dy = (py - e.y) / e.radius
      const envelope = Math.sin(Math.PI * (time - e.start) / e.life)
      const peak = strength * envelope
      const gate = overrideGate(peak)
      if (gate === 0) continue
      const rho = Math.sqrt(dx * dx + dy * dy)
      const speed = peak / EDDY_PEAK * rho * Math.exp(-rho * rho)
      fade = Math.max(fade, gate * Math.min(1, speed / STIR_OVERRIDE.speed))
    }
    for (let k = 0; k < drifting.length && fade < 1; k++) {
      const e = drifting[k]
      const envelope = driftEnvelope(e)
      const peak = e.gain * strength * envelope
      const gate = overrideGate(peak)
      if (gate === 0) continue
      const r = Math.hypot(px - e.x, py - e.y)
      const q = r / e.core
      const speed = peak * 2 * q / (1 + q * q) * Math.exp(-(r * r) / (e.radius * e.radius))
      fade = Math.max(fade, gate * Math.min(1, speed / STIR_OVERRIDE.speed))
    }
    return fade
  }

  // How much the stirring at a point overrides the inertia: the eddies above, or a moving finger
  // (push, pull, spin) by its weight.
  function stirFree (px, py) {
    let fade = overrideAt(px, py)
    if (touches.length && fade < 1) {
      const radius = touchRadiusNow > 0 ? touchRadiusNow : Math.max(TOUCH_MIN, TOUCH_RADIUS * Math.min(width, height))
      for (let k = 0; k < touches.length; k++) {
        const t = touches[k]
        if (t.mode === 'heat' || t.mode === 'cool') continue
        const q = Math.hypot(px - t.x, py - t.y) / radius
        fade = Math.max(fade, Math.min(1, STIR_OVERRIDE.finger * Math.exp(-q * q)))
      }
    }
    return fade
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

  // Sort the particle arrays into the hash's cell order, so that a particle's neighbours sit near
  // it in memory and the neighbour loops stop jumping about: at 50000 particles that was the
  // step, 125 ms with no single hot function left (Robert: "let's see if we can make it work at
  // 50k"). The hash has just been built, so its indices array is the order; afterwards it is the
  // identity. Every array indexed by particle moves: positions, velocities, temperature, the
  // pre-relaxation positions and the bottle. Scratch arrays (pressure, weights, shared heat) are
  // recomputed each step and need not. The relaxation then walks the particles in cell order,
  // which is a sweep across the lamp rather than the random order they were spawned in, so the
  // step alternates direction (sweep) to keep the sweep from pushing the lava one way. Same
  // statistics as before, different frames: a seed reproduces a lamp within a version, not
  // across this change.
  // The order the relaxation visits the particles: a fresh random order every step. The relaxation
  // is sequential (each particle sees the moves of the ones before it), so any fixed order is a
  // sweep, and a sweep pushes lava the way it walks. Walking the sorted particles straight through
  // (93 ms at 50000) made the liquid stiffer and killed the pinch; cells in a fixed random order
  // with each cell's particles together (103 ms) looked innocent in the gas tests but, because the
  // counting sort leaves each cell's particles in left to right order, it swept every cell left to
  // right and a cold pool ran as a conveyor, bottom row one way and the row above the other, up the
  // far wall, 0.4 px a frame forever (Robert: "the new primary goal is to get static particles that
  // aren't constantly moving with no stimulus"). Reversing the order inside the cells reversed the
  // conveyor; a fresh shuffle every step removed it. The data stays sorted for the neighbour reads.
  function planVisit () {
    if (visit.length < alive) visit = new Int32Array(alive)
    for (let i = 0; i < alive; i++) visit[i] = i
    for (let i = alive - 1; i > 0; i--) {
      visitSeed = (visitSeed * 1103515245 + 12345) & 0x7fffffff
      const j = visitSeed % (i + 1)
      const t = visit[i]; visit[i] = visit[j]; visit[j] = t
    }
  }

  // Sort the particle arrays into the hash's cell order, so that a particle's neighbours sit near
  // it in memory and the neighbour loops stop jumping about: at 50000 particles that was the
  // step, 125 ms with no single hot function left (Robert: "let's see if we can make it work at
  // 50k"). The hash has just been built, so its indices array is the order; afterwards it is the
  // identity. Every array indexed by particle moves: positions, velocities, temperature, the
  // pre-relaxation positions and the bottle. Scratch arrays (pressure, weights, shared heat) are
  // recomputed each step and need not. The relaxation then walks the particles in cell order,
  // which is a sweep across the lamp rather than the random order they were spawned in, so the
  // step alternates direction (sweep) to keep the sweep from pushing the lava one way. Same
  // statistics as before, different frames: a seed reproduces a lamp within a version, not
  // across this change.
  // The order the relaxation visits the particles: a fresh random order every step. The relaxation
  // is sequential (each particle sees the moves of the ones before it), so any fixed order is a
  // sweep, and a sweep pushes lava the way it walks. Walking the sorted particles straight through
  // (93 ms at 50000) made the liquid stiffer and killed the pinch; cells in a fixed random order
  // with each cell's particles together (103 ms) looked innocent in the gas tests but, because the
  // counting sort leaves each cell's particles in left to right order, it swept every cell left to
  // right and a cold pool ran as a conveyor, bottom row one way and the row above the other, up the
  // far wall, 0.4 px a frame forever (Robert: "the new primary goal is to get static particles that
  // aren't constantly moving with no stimulus"). Reversing the order inside the cells reversed the
  // conveyor; a fresh shuffle every step removed it. The data stays sorted for the neighbour reads.
  function planVisit () {
    if (visit.length < alive) visit = new Int32Array(alive)
    for (let i = 0; i < alive; i++) visit[i] = i
    for (let i = alive - 1; i > 0; i--) {
      visitSeed = (visitSeed * 1103515245 + 12345) & 0x7fffffff
      const j = visitSeed % (i + 1)
      const t = visit[i]; visit[i] = visit[j]; visit[j] = t
    }
  }

  // A fixed shuffle of 0 to n - 1 from its own little generator, so the lamp's seeded randomness
  // is untouched.
  function shuffledOrder (n, seed = 12345) {
    const order = new Int32Array(n)
    for (let i = 0; i < n; i++) order[i] = i
    for (let i = n - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      const j = seed % (i + 1)
      const t = order[i]; order[i] = order[j]; order[j] = t
    }
    return order
  }

  function reorder () {
    const order = hash.indices
    if (scratchF.length < alive) { scratchF = new Float32Array(alive); scratchI = new Int16Array(alive); scratchId = new Int32Array(alive) }
    const { x, y, vx, vy, temp, px, py, home, id } = state
    for (const a of [x, y, vx, vy, temp, px, py]) {
      for (let k = 0; k < alive; k++) scratchF[k] = a[order[k]]
      a.set(scratchF.subarray(0, alive))
    }
    for (let k = 0; k < alive; k++) scratchI[k] = home[order[k]]
    home.set(scratchI.subarray(0, alive))
    for (let k = 0; k < alive; k++) scratchId[k] = id[order[k]]
    id.set(scratchId.subarray(0, alive))
    for (let k = 0; k < alive; k++) order[k] = k
  }

  function step (dt) {
    const { particleCount, interactionRadius, stiffness, stiffnessNear, restDensity, maxTemp, gravity, particleSize, stir = 0, conduction = CONDUCTION, turbulence = 0, drifters = 0, heatSpots = 0, cupDepth = 0, wobble = 0, wobbleKick = WOBBLE_KICK, wobbleMax = WOBBLE_MAX, heater = true, touchHeat = TOUCH_HEAT, touchStrength = 1, touchRadius = 0, settle = 1, viscosity: sigma = 0, reach: reachRadii = RELAX_REACH, wallPush = 0, kickBelow = 0, share = 0.1, elementHeat: elementHeatTop = ELEMENT_HEAT[1], elementLife: elementLifeTop = ELEMENT_LIFE[1], elementRate = ELEMENT_RATE, elementLifeScale = ELEMENT_LIFE_SCALE, elementCore = ELEMENT_CORE, floorHeat = SPOT_BASE, floorGlow = SPOT_GLOW, liftCap = LIFT_CAP } = params
    cupDepthNow = cupDepth
    touchHeatNow = touchHeat
    touchStrengthNow = touchStrength
    touchRadiusNow = touchRadius
    wallPushNow = wallPush
    interactionRadiusNow = interactionRadius || 20
    spawnAreaNow = params.spawnArea || SPAWN_AREA
    if (cups.length === 0) layoutCups()
    if (floorCups.length === 0) layoutCups(floorCups, false, FLOOR_BULB)
    // params.particleCount is the visible lava; the floor's reservoirs fill themselves on top of
    // it, a particle per SPAWN_AREA of their area, so the pool stays the same depth whatever the
    // seed lays out below it (bottle rows vary from 670 to 930 particles' worth at a full window).
    if (floorCups.length === 0) layoutCups(floorCups, false, FLOOR_BULB)
    // params.worldOnly: no lava at all (the GPU lamp runs this simulation for its world, the
    // heater, the eddies and the bottles, and keeps the particles on the GPU).
    const target = params.worldOnly ? 0 : particleCount + reserveFill()
    ensureCapacity(target)
    fill(target)
    stirEddies(dt, turbulence, drifters)
    // Warm up: the heater power is a front spreading from the middle of the floor (see WARMUP).
    heaterTime += dt
    const progress = Math.min(1, heaterTime / WARMUP)
    const halfWidth = width / 2
    if (elements.length === 0) layoutElements()
    const shorter = Math.min(width, height)
    // Light an element now, as its clock would; also on demand (lightElement, the music's beat).
    const ignite = el => {
      el.heat = randomRange(elementHeatTop * ELEMENT_HEAT[0] / ELEMENT_HEAT[1], elementHeatTop)
      el.start = heaterTime
      let lifeScale = 1
      if (ELEMENTS_ARE_CUPS) {
        // A bigger cup burns longer, by its area over the smallest cup's, up to elementLifeScale.
        lifeScale = Math.min(elementLifeScale, el.areaRatio)
        // This lighting's core: narrow to the whole cup, leaning narrow; wider burns shorter.
        const coreMin = Math.min(el.cupHalf, elementCore * shorter / width)
        const u = random()
        el.coreFraction = coreMin + (el.cupHalf - coreMin) * u * u
        lifeScale = Math.max(1, lifeScale * coreMin / el.coreFraction)
      }
      el.life = randomRange(elementLifeTop * ELEMENT_LIFE[0] / ELEMENT_LIFE[1], elementLifeTop) * lifeScale
      el.next = 0
    }
    // Once warmed up, elements light on their own clocks (see ELEMENT_GAP and ELEMENT_RATE).
    if (progress >= 1 && heatSpots > 0 && heater) {
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
          if (el.mode !== 'charge' && heaterTime - el.start > el.life) { el.heat = 0; el.mode = null; el.big = false }
          continue
        }
        // Each element's share of ELEMENT_RATE lightings per heatSpots seconds is its weight over
        // the total, so the lightings add up to that rate whatever the sizes and positions. The
        // first wait is a random fraction of the usual one, as if the lamp had been running: with
        // every clock starting full the first lighting was the shortest of a dozen long waits
        // ("still taking forever before the first heater fires").
        if (el.next === 0) {
          const wait = heatSpots / elementRate * weight / el.weight
          el.next = heaterTime + wait * (el.fresh ? randomRange(0, 1) : randomRange(0.5, 1.5))
          el.fresh = false
        }
        if (heaterTime >= el.next) ignite(el)
      }
      // Pots asked for on demand (the music's beat): one of the unlit ones, drawn by weight, so
      // the small pots near the middle answer most, as the clocks' lightings do.
      while (lightRequests > 0) {
        lightRequests--
        let total = 0
        for (const el of elements) if (el.heat <= 0) total += el.weight
        if (total <= 0) break
        let pick = random() * total
        for (const el of elements) {
          if (el.heat > 0) continue
          pick -= el.weight
          if (pick <= 0) { ignite(el); break }
        }
      }
      // The drop: charge the biggest cold pot, hold it, blast it.
      const biggestCold = () => {
        let best = null
        for (const el of elements) if (el.heat <= 0 && (!best || el.areaRatio > best.areaRatio)) best = el
        return best
      }
      const drawnCold = () => {
        let total = 0
        for (const el of elements) if (el.heat <= 0) total += el.weight
        let pick = random() * total
        for (const el of elements) { if (el.heat > 0) continue; pick -= el.weight; if (pick <= 0) return el }
        return null
      }
      const unlid = () => { charged.mode = null; charged.big = false; charged.heat = 0; charged.next = 0; charged = null; lidPot = -1 }
      // The lid moves to the biggest pot when the kick goes (a breakdown): a beat's pot was
      // charging, the drop's is wanted. A whole big pot every beat sent too much up: half the
      // lamp's lava sat in the ceiling bottles by 28 s, against 10 to 20% with no lids.
      if (charged && charged.mode === 'charge' && chargeBig && !charged.big) unlid()
      if (chargeLevel > 0 && !charged) {
        charged = chargeBig ? biggestCold() : drawnCold()
        if (charged) {
          charged.mode = 'charge'
          charged.big = chargeBig
          charged.start = heaterTime
          const coreMin = Math.min(charged.cupHalf, elementCore * shorter / width)
          charged.coreFraction = chargeBig ? charged.cupHalf : coreMin
          lidPot = charged.pot
        }
      }
      if (charged && charged.mode === 'charge') {
        if (chargeLevel > 0) charged.heat = elementHeatTop * chargeLevel
        else if (dropRequest <= 0) unlid() // called off
      }
      if (ventRequest > 0) { if (charged && charged.mode === 'charge') ventUntil = heaterTime + ventRequest; ventRequest = 0 }
      if (charged && charged.mode === 'charge') lidPot = heaterTime < ventUntil ? -1 : charged.pot
      if (dropRequest > 0) {
        const el = charged || biggestCold()
        if (el) {
          el.mode = 'blast'
          el.heat = elementHeatTop * DROP_BLAST * dropRequest
          el.start = heaterTime
          el.life = DROP_LIFE
          if (!el.big) el.life = DROP_LIFE / 2
          el.next = 0
        }
        charged = null
        lidPot = -1
        dropRequest = 0
      }
    } else {
      lightRequests = 0
      dropRequest = 0
      charged = null
      lidPot = -1
      for (const el of elements) {
        el.heat = 0
        el.next = 0
        el.mode = null
      }
    }
    // Each lit element's glow, 0 to 1, and its reach in px, for this step.
    let maxReach = 0
    for (const el of elements) {
      el.x = el.fx * width
      el.radius = el.fr * shorter
      el.halfWidth = ELEMENTS_ARE_CUPS ? el.coreFraction * width : el.radius * ELEMENT_ASPECT
      el.capTemp = el.mode === 'charge' || el.mode === 'blast' ? Math.min(maxTemp, gravity * Math.min(el.big ? CHARGE_LIFT : CHARGE_LIFT_BEAT, 1 + liftCap)) : 0
      if (el.mode === 'charge') el.glow = el.heat > 0 ? 1 : 0
      else if (el.mode === 'blast') { const t = (heaterTime - el.start) / el.life; el.glow = el.heat > 0 ? (t < 0.5 ? 1 : Math.max(0, 2 * (1 - t))) : 0 }
      else el.glow = el.heat > 0 ? Math.sin(Math.PI * (heaterTime - el.start) / el.life) : 0
      if (el.glow > 0 && el.radius * 2 > maxReach) maxReach = el.radius * 2
    }
    const powerAt = x => {
      if (!heater) return 0 // the pinch lab heats with a finger only
      if (progress >= 1) {
        if (heatSpots <= 0) return 1
        let power = floorHeat
        for (const el of elements) {
          // A lidded pot heats only its own lava: its glow on the floor above warmed the pool's
          // lava over it into a white column before any drop.
          if (el.glow <= 0 || el.mode === 'charge') continue
          const d = (x - el.x) / el.halfWidth
          power += floorGlow * el.glow * Math.exp(-d * d)
        }
        return power > SPOT_CAP ? SPOT_CAP : power
      }
      const r = Math.abs(x - halfWidth) / halfWidth
      const p = (progress * 1.2 - r) / 0.2
      return p < IDLE_HEAT ? IDLE_HEAT : p > 1 ? 1 : p
    }
    heaterPower = powerAt
    // The heat a lit element delivers to a point: its heat at the centre, Gaussian over its radius.
    // Lava inside a pot gets its own element's heat in full, wherever it sits in the pot: measured
    // from the line, the Gaussian left the bottom of a pot at 7% of the heat (profiles under a
    // lit element at Robert's grain and the lab's both read 800 at the line and 500 at 200 px
    // deep), and Robert: "It's supposed to heat the whole contents of the pot, but it looks like
    // it's only heating at the line across".
    const elementHeat = (px, py, pot) => {
      if (pot >= 0 && ELEMENTS_ARE_CUPS) {
        const el = elements[pot]
        return el && el.glow > 0 ? el.heat * el.glow : 0
      }
      let heat = 0
      const dy = height - py
      for (const el of elements) {
        if (el.glow <= 0 || el.mode === 'charge') continue // a lidded pot heats only its own lava
        const dx = (px - el.x) * el.radius / el.halfWidth
        const d2 = (dx * dx + dy * dy) / (el.radius * el.radius)
        if (d2 < 4) heat += el.heat * el.glow * Math.exp(-d2)
      }
      return heat
    }
    const elementReach = height - maxReach
    const { x, y, vx, vy, temp, px, py } = state
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
    const overriding = touching || overrideActive()

    const cell = Math.max(MIN_CELL, interactionRadius * CELL_FRACTION)
    if (hash.cellSize !== cell) hash.resize(width, height, cell)
    for (let i = 0; i < alive; i++) {
      temp[i] = nextTemperature(temp[i], y[i], height, maxTemp, particleSize, heater ? powerAt(x[i]) : 0, HEAT_IN_CUPS && cupDepthNow > 0 ? floorAt(x[i]) : height)
      if (maxReach > 0 && y[i] > elementReach && (HEAT_IN_CUPS || ELEMENTS_ARE_CUPS || y[i] <= height)) {
        const heat = elementHeat(x[i], y[i], state.home[i])
        if (heat > 0) temp[i] = Math.max(temp[i], Math.min(state.home[i] >= 0 && y[i] > height && state.home[i] >= 0 && elements[state.home[i]] && elements[state.home[i]].capTemp > 0 ? elements[state.home[i]].capTemp : maxTemp, temp[i] + heat))
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
      // The stirring (the roll, the eddies, the fingers, a shake of the phone) is a velocity
      // imposed on the lava, a spoon in the wax, and moves it this step at full strength. Only
      // buoyancy goes through the inertia below. Eased in with the drift as it was, a finger or
      // an eddy added a fraction of a pixel a step and the pressure pass undid it every time
      // (push held two seconds in the pool: no change at Wobble 0.87, half the lava under the
      // finger gone at Wobble 0; Robert: "the touch controls on GPU are super weak ... the
      // eddies are also too weak now").
      // Lava in a bottle takes no stirring: the eddies and the roll reach past the floor line,
      // and at full strength they packed the hidden lava against the glass (814 particles in a
      // 20 px cell of a pot against 42 at rest, at Turbulence 150 with six drifters; every
      // neighbour loop paid for the pile and the GPU lamp fell from 115 fps toward single
      // digits: Robert, "something is breaking the performance").
      const bottled = state.home[i] >= 0
      const stirX = bottled ? 0 : fx - stir * Math.sin(kx * x[i]) * Math.cos(ky * y[i]) + eddy[0] + finger[0]
      const stirY = bottled ? 0 : fy + vertical * Math.cos(kx * x[i]) * Math.sin(ky * y[i]) + eddy[1] + finger[1]
      const driftX = 0
      const driftY = Math.max(gravity - temp[i], -liftCap * gravity)
      if (wobble > 0) {
        // Inertia (Robert, with a video of a real lamp: "it's that snap back effect. and the
        // stretchiness and jiggle. we don't have those... This is a miss in our physics
        // simulation"). The velocity is carried from frame to frame and eased toward the drift
        // over `wobble` seconds, and the kick the pressure step gave it last frame (recorded
        // below) comes along, so a pinched neck recoils and a freed blob rings. At 0 the velocity
        // is rebuilt every frame, which is the overdamped wax the lamp was tuned as.
        const ease = Math.min(1, dt / wobble)
        vx[i] += (driftX - vx[i]) * ease
        vy[i] += (driftY - vy[i]) * ease
        // Under a finger or inside a strong eddy the lava has no memory: see STIR_OVERRIDE.
        if (overriding && !bottled) {
          const f = stirFree(x[i], y[i])
          if (f > 0) { vx[i] += (driftX - vx[i]) * f; vy[i] += (driftY - vy[i]) * f }
        }
      } else {
        vx[i] = driftX
        vy[i] = driftY
      }
      px[i] = x[i] + (vx[i] + stirX) * dt
      py[i] = y[i] + (vy[i] + stirY) * dt
      x[i] = px[i]
      y[i] = py[i]
    }
    hash.build(x, y, alive)
    reorder()
    planVisit()

    const { g, shared, home } = state
    // No particle moves more than one interaction radius in a relaxation step. Past that it has
    // left every neighbour it was computed against and the step is meaningless; the pressure that
    // threw it is still there next step. Robert, at Density 9.1 with radius 17, the pool a gas of
    // specks: "increasing density too much completely destabilizes it... there's some kind of
    // check condition that we're probably missing to prevent the complete breakdown". Measured:
    // at 9.1, 16% of particle steps moved more than a radius; at his stable 3.3, 1.5%; in the
    // lamp at its defaults, 0.05% (the odd jitter jump). At one radius 9.1 is still a third as
    // scattered as before; at a third of a radius it holds together completely, but a third of a
    // radius is the 20 px cap that extruded the lamp's pool up the walls when it was tried on the
    // visible pool, and even one radius moved the wall lava numbers, so the lamp runs uncapped as
    // tuned and the lab's Reach knob defaults to 0.33.
    const reach = interactionRadius * reachRadii
    if (nbStart.length < alive) { nbStart = new Int32Array(alive); nbEnd = new Int32Array(alive) }
    let nbUsed = 0
    for (let s = 0; s < alive; s++) {
      const i = visit[s]
      const neighbours = findNeighbours(state, hash, i, interactionRadius)
      nbStart[i] = nbUsed
      if (nbUsed + neighbours.length > nbList.length) {
        const bigger = new Int32Array(Math.max(nbList.length * 2, nbUsed + neighbours.length))
        bigger.set(nbList)
        nbList = bigger
      }
      for (let k = 0; k < neighbours.length; k++) nbList[nbUsed++] = neighbours[k]
      nbEnd[i] = nbUsed
      updatePressure(state, i, neighbours, stiffness, stiffnessNear, restDensity)
      let weight = 0
      let heat = 0
      const inBottle = home[i] >= 0
      for (let k = 0; k < neighbours.length; k++) {
        const n = neighbours[k]
        // Heat crossing from one bottle to another goes through glass: GLASS_CONDUCTION of the
        // usual (Robert: "the blobs can still share heat if they're close enough in the bottles,
        // which is kinda good because it makes neighbor bottles interact and drop together, but i
        // think we should model this intentionally and make the heat conduction less effective
        // if it's crossing between bottles"). Through a mouth it is full.
        const w = inBottle && home[n] >= 0 && home[i] !== home[n] ? g[n] * GLASS_CONDUCTION : g[n]
        weight += w
        heat += w * temp[n]
      }
      shared[i] = weight > 0 ? heat / weight : temp[i]
      relax(state, i, neighbours, dt, home[i] >= 0 ? Math.min(RELAX_CAP, reach) : reach, share)
      // Only at a surface, a stretched neck or a blob's skin being pulled back toward its neighbours
      // (surface tension), does the pressure step's kick become velocity, capped at WOBBLE_MAX
      // gravities. The surface test is pressure below zero, which is density below the rest
      // density: right when the pool sits at its rest density, as the lamp's does. With `kickBelow`
      // the test is density below that fraction of the lava's mean density instead: Robert's
      // liquid sets the rest density far above anything the pool reaches (Stiff 3.7, Density 530,
      // the pool at 12), so pressure is negative everywhere and the whole cold pool was kicked
      // every frame, 91 px/s of carried velocity in lava that should lie still, and climbed the
      // walls on it ("with heat off, the fluid should be completely static").
      // A particle in contact with a side wall is never skin: the wall takes half its neighbours,
      // so its density reads low, and its pressure move, with the inward part clamped, is along
      // the wall. Kicked, those moves carried a one particle film up both walls in a cold pool
      // (Robert: "just a smidge of climbing still"; 15 particles 39 px up the wall, none with
      // this; the pinch unchanged).
      const onWall = x[i] < WALL_CONTACT || x[i] > width - WALL_CONTACT
      const surface = !onWall && (kickBelow > 0 ? state.p[i] / stiffness + restDensity < kickBelow * meanDensity : state.p[i] < 0)
      // Carrying the bulk pressure's kicks as well made the whole pool slosh like water even at a
      // tenth of a second. Walls and glass never kick: contain comes after.
      if (wobble > 0 && surface) {
        vx[i] += (x[i] - px[i]) / dt * wobbleKick * startEase
        vy[i] += (y[i] - py[i]) / dt * wobbleKick * startEase
        const speed = Math.hypot(vx[i], vy[i])
        const limit = wobbleMax * gravity
        if (speed > limit) { vx[i] *= limit / speed; vy[i] *= limit / speed }
      }
      contain(i)
    }
    // Viscosity (section 5.3) on the carried velocity, so it damps the kicks just given as well as
    // the drift: approaching neighbours slow each other, separating ones do not. Only meaningful
    // when velocity is carried (wobble > 0); at 0 the velocity is rebuilt next frame anyway, so
    // the pass is skipped. Neighbours are the pressure pass's, reweighted at the current positions.
    if (sigma > 0 && wobble > 0) {
      for (let s = 0; s < alive; s++) {
        const i = visit[s]
        const neighbours = reuseNeighbours(state, nbList, nbStart[i], nbEnd[i], i, interactionRadius)
        viscosity(state, i, neighbours, dt, sigma)
      }
    }
    // Extra relaxation passes (settle > 1): the pressure solver is one sweep a frame, so particle
    // spacing is never quite even and the outline wears that as bumps. Each further pass evens it
    // out (skin spacing spread 23% to 13% at two passes in the pinch lab) for about 80% more step
    // time in the full lamp (4.8 to 8.6 ms at 2439 particles). Robert: "reduce jiggle at the
    // edges to make the surface less bumpy to begin with? that'd be a physics tuning adjustment,
    // might be worth a knob". Viscosity (easing each velocity toward the neighbours' mean) was
    // tried first and roughened the skin instead. No conduction or kick in these passes.
    for (let pass = 1; pass < settle; pass++) {
      for (let s = 0; s < alive; s++) {
        const i = visit[s]
        const neighbours = reuseNeighbours(state, nbList, nbStart[i], nbEnd[i], i, interactionRadius)
        updatePressure(state, i, neighbours, stiffness, stiffnessNear, restDensity)
        relax(state, i, neighbours, dt, home[i] >= 0 ? Math.min(RELAX_CAP, reach) : reach, share)
        contain(i)
      }
    }
    let densitySum = 0
    for (let i = 0; i < alive; i++) densitySum += state.p[i] / stiffness + restDensity
    meanDensity = alive > 0 ? densitySum / alive : 0
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
      if (floorCups.length === 0) layoutCups(floorCups, false, FLOOR_BULB)
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
        // The core width and the life scale are drawn at each lighting from the params; the
        // cup's area over the smallest cup's is what the life scale is capped against.
        elements.push({ pot: elements.length, fx, fr, weight, cupHalf: cup.fw / 2, coreFraction: core / width, areaRatio: (cupWidth * cupWidth) / (smallest * smallest), heat: 0, start: 0, life: 0, next: 0, fresh: true, x: 0, radius: 0, halfWidth: 0, glow: 0 })
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
      elements.push({ pot: -1, fx, fr, weight, heat: 0, start: 0, life: 0, next: 0, fresh: true, x: 0, radius: 0, halfWidth: 0, glow: 0 })
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

  // A particle at a wall loses the velocity it carried into it: the wall took that momentum. Left
  // in, a carried velocity pressed the particle into the wall every frame and the wall became the
  // thing the lava stuck to (Robert, with the liquid otherwise right: "We have a mad bad wall
  // climbing problem"; measured at his line, 27% of the lava above the pool was within 25 px of a
  // wall, two and a half times the lava in the next 25 px; at Wobble 0, where velocity is rebuilt
  // every frame anyway, 8% and 1.1 times). With `wallPush`, lava within that many px of a wall is
  // also eased away from it, a glass that wax does not wet. The lamp's defaults (Wobble 0, no push)
  // are untouched by either.
  function contain (i) {
    const { x, y, vx, vy } = state
    if (x[i] < 0) { x[i] = 0; if (vx[i] < 0) vx[i] = 0 } else if (x[i] > width) { x[i] = width; if (vx[i] > 0) vx[i] = 0 }
    if (wallPushNow > 0) {
      if (x[i] < wallPushNow) vx[i] += (wallPushNow - x[i]) * WALL_PUSH_RATE
      else if (x[i] > width - wallPushNow) vx[i] -= (x[i] - (width - wallPushNow)) * WALL_PUSH_RATE
    }
    if (cupDepthNow > 0) {
      // The drop's lid: lava of the lidded pot that reaches the mouth's line is held under it.
      // A home is an index into its own row, so only one just above the floor's line counts.
      if (lidPot >= 0 && state.home[i] === lidPot && y[i] <= height && y[i] > height - 4 * interactionRadiusNow) { y[i] = height + 0.5 + (Math.imul(i, 2654435761) >>> 29) * 0.857; if (vy[i] < 0) vy[i] = 0 } // each a different depth under the line: at one depth they stacked in rows and left in stripes
      if (y[i] > height) containIn(floorBottleList(), i)
      else if (y[i] < CUP_LIP * Math.min(width, height)) containIn(ceilingBottleList(), i)
      else state.home[i] = -1
    } else {
      if (y[i] < 0) { y[i] = 0; if (vy[i] < 0) vy[i] = 0 } else if (y[i] > height) { y[i] = height; if (vy[i] > 0) vy[i] = 0 }
    }
  }

  // Lay a row of bottles once (see CUP_WIDTH): widths from the bell curve, each placed after the
  // last with a random gap and no overlap, until the row is full. Fractions, so a resize keeps
  // the same lamp. `onWalls` centres the first and last on the walls; the floor used that while
  // its cups tiled the width (rims at the walls made the corner the floor's high point under the
  // down-the-wall flow and lava piled there: "we got significant wall climbing back"), but a
  // bottle straddling a wall squeezes its lava into the half that exists and extrudes it up the
  // wall, and with gaps in the row a flat corner is just another stretch of floor.
  function layoutCups (into = cups, onWalls = false, bulbShare = 1) {
    const shorter = Math.min(width, height)
    // A candidate bottle: its width, its shape, and the half width of its mouth with its fillet,
    // which is what must not overlap the next bottle's.
    const draw = () => {
      let w = (CUP_WIDTH[0] + randomNormal() * CUP_WIDTH[1]) * shorter
      w = Math.max(CUP_WIDTH_RANGE[0] * shorter, Math.min(CUP_WIDTH_RANGE[1] * shorter, w))
      const shape = drawShape()
      const mouthHalf = BOTTLE_MOUTH * Math.min(w / 2, w / 2 * bulbShare)
      return { w, shape, reach: mouthHalf * (1 + BOTTLE_ROUND) + 2 }
    }
    const drawGap = () => Math.min(0.4 * shorter, -Math.log(1 - random()) * CUP_GAP * shorter)
    let edge = 0 // the right edge of the last bottle's reach
    if (onWalls) {
      const c = draw()
      into.push({ fx: 0, fw: c.w / width, fn: random(), shape: c.shape })
      edge = c.reach
    } else {
      edge = drawGap() * 0.5
    }
    // The last one on the right wall needs room: reserve its reach.
    const last = onWalls ? draw() : null
    const limit = width - (last ? last.reach : 0)
    for (let guard = 0; guard < 200; guard++) {
      const c = draw()
      const gap = drawGap()
      const centre = edge + gap + c.reach
      if (centre + c.reach > limit) break
      into.push({ fx: centre / width, fw: c.w / width, fn: random(), shape: c.shape })
      edge = centre + c.reach
    }
    if (last) into.push({ fx: 1, fw: last.w / width, fn: random(), shape: last.shape })
  }

  // A bulb's shape: the kind and its random numbers, as fractions, drawn once per bottle.
  function drawShape () {
    const kind = BULB_SHAPES[Math.floor(random() * BULB_SHAPES.length)]
    // Every bulb is also stretched: an ellipse `aspect` long along `tilt`, so bulbs come wide and
    // shallow, tall, or oblong at an angle (Robert: "some should be sorta oblong and wide, also
    // weird angles of oblong is good too"); like the shapes it fades out toward the mouth.
    const shape = { kind, n: 5 + Math.floor(random() * 4), amp: randomRange(0.18, 0.32), phase: random() * Math.PI * 2, waves: [], spikes: [], aspect: randomRange(0.7, 1.9), tilt: random() * Math.PI }
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
    if (fade <= 0) return 1
    // The stretch: an ellipse's radius at this angle, relative to a circle.
    const c = Math.cos(theta - (shape.tilt || 0))
    const sn = Math.sin(theta - (shape.tilt || 0))
    const a = shape.aspect || 1
    const stretch = 1 / Math.sqrt((c * c) / (a * a) + sn * sn)
    if (shape.kind === 'round') return 1 + (stretch - 1) * fade
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
    return 1 + ((1 + bump) * stretch - 1) * fade
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
      // The outline's largest radius, for the lamp's extent and for quick "could it be inside" tests,
      // and the outline itself as a polygon, for putting a stray particle back on its nearest point.
      let reach = R
      const outline = new Float32Array(OUTLINE_POINTS * 2)
      for (let k = 0; k < OUTLINE_POINTS; k++) {
        const theta = k / OUTLINE_POINTS * Math.PI * 2
        const rr = radiusAt(theta)
        reach = Math.max(reach, rr)
        outline[k * 2] = cup.fx * width + Math.cos(theta) * rr
        outline[k * 2 + 1] = cy + Math.sin(theta) * rr
      }
      out.push({ cx: cup.fx * width, lineY, dir, w, rm, rs, yf, neckEnd, cy, R, joinAngle, reach: reach + 1, radiusAt, outline, kind: shape.kind })
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
      // Entering from the pool: the bottle that already contains the point if there is one
      // (bulbs reach under their neighbours' mouths), else the one whose mouth it is under.
      // Choosing by mouth alone sent a particle that had been nudged out of one bottle into
      // the next, a jump of a bulb's width ("huge jitter jumps between the bottles, looks like
      // quantum tunneling again but it seems like it's snapping back into the same pot").
      k = -1
      for (let j = 0; j < list.length; j++) if (insideBottle(list[j], x[i], y[i])) { k = j; break }
      if (k < 0) for (let j = 0; j < list.length; j++) if (Math.abs(x[i] - list[j].cx) <= neckHalf(list[j], lineY)) { k = j; break }
      if (k < 0) { y[i] = lineY; return }
      // A lidded pot takes nothing in: held at the line, as under no mouth.
      if (dir > 0 && k === lidPot) { y[i] = lineY; return }
      home[i] = k
    }
    const b = list[k]
    if (insideBottle(b, x[i], y[i])) return
    const dx = x[i] - b.cx
    const dy = y[i] - b.cy
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
      } else if (rc > 0 && Math.abs(dx) > b.w + rc) {
        // Past a fillet's square: in the lip, so the line or the bulb is the way back. Along the
        // straight wall (rc 0) any distance outside is just a sideways push; treating it as
        // invalid sent neck particles to the line or the bulb instead ("they also teleport a
        // smaller distance when falling out of the skinny bottles").
        valid = false
      }
      if (valid) {
        const d = Math.hypot(nx - x[i], ny - y[i])
        if (d < bestD) { bestD = d; bestX = nx; bestY = ny }
      }
    }
    // The nearest point on the bulb's outline. Pushing back along the ray from the centre
    // instead landed a particle beside a narrow spike on the valley next to it, tens of pixels
    // away ("I noticed some teleporting in the bottles on the top ... jumping up higher or lower
    // by ~1/2 inch").
    const o = b.outline
    const n = OUTLINE_POINTS
    for (let k = 0; k < n; k++) {
      const ax = o[k * 2]
      const ay = o[k * 2 + 1]
      const bx = o[((k + 1) % n) * 2]
      const by = o[((k + 1) % n) * 2 + 1]
      const ex = bx - ax
      const ey = by - ay
      const len2 = ex * ex + ey * ey || 1
      let t = ((x[i] - ax) * ex + (y[i] - ay) * ey) / len2
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const qx = ax + ex * t
      const qy = ay + ey * t
      const d = Math.hypot(qx - x[i], qy - y[i])
      if (d < bestD) { bestD = d; bestX = qx; bestY = qy }
    }
    x[i] = bestX
    y[i] = bestY
    // A particle held at the line keeps its bottle; it only loses it once it is up in the pool
    // (see contain), so it cannot be re-sorted into a neighbour on the way back down.
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
    // Light a pot at the next step, as its clock would have (the music's beat).
    lightElement () { lightRequests++ },
    spawnEddy () { eddyRequests++ },
    pulseWave () { pulseRequests++ },
    flipEddies (chance = 1) { flipRequests.push(chance) },
    chargePot (level, big) { chargeLevel = Math.max(0, level || 0); chargeBig = !!big },
    dropPot (strength) { dropRequest = Math.max(dropRequest, strength || 0) },
    ventPot (seconds) { ventRequest = Math.max(ventRequest, seconds || 0) },
    get lid () { return lidPot },
    transform,
    flowAt,
    overrideAt,
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
