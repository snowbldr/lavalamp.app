import { fnstate } from '@srfnstack/fntags'
import { notify } from './components.js'
import { CURRENT } from '../versions.js'
import { seedRandom } from '../sim/random.js'
import { staticColorsBys as STATIC_BYS, staticColorsByNames } from '../render/staticColors.js'

// Defaults that depend on the window. They take the raw window size, not the capped lamp size,
// because that is what the lamp was tuned against.
// One particle per 3000 square px of window, at most 1500. It was one per 4000 and at most 1000
// while the 2D canvas renderer spent most of the frame reading pixels back; with the metaball pass
// on the GPU the step is the only cost that grows with lava (1.1 ms at 1000 particles, 1.9 at 1500,
// on Robert's Mac), and Robert asked for "a bit more lava by default after we improve the
// performance". The cap used to be 300, from when the lamp itself stopped at 1000 px square.
// The visible lava: one particle per 3200 square px of window, at most 1400. The reservoirs under
// the floor fill themselves on top of this inside the simulation (their volume depends on the seed's
// layout, 670 to 930 particles' worth at a full window), so this number is the pool and the globs,
// which is what the Count knob should mean. It was one per 4000 and at most 1000 while the 2D
// canvas renderer spent most of the frame reading pixels back.
// All of the above was the lamp's first liquid, radius 60. The liquid is Robert's lab liquid of
// 2026-10-30 now ("this is the new default setting... for sure"), tuned in the pinch lab at 360 by
// 900 with 3050 particles at radius 20: one particle per LAB_AREA_PER_PARTICLE px of window. That
// many particles cost about 9 ms a step; a desktop window would want ten times as many, which the
// CPU cannot do (Robert: "we need a ton more particles for a bigger screen... Ideally we get
// better performance with the gpu"). Until the GPU backend, a window that wants more than
// MAX_PARTICLES gets the same liquid coarser: the radius, the disc size and the smoothing all
// grow by the square root of the excess, so the lava fills the same share of the lamp with the
// same motion, at a bigger grain. A phone window is the lab's size and gets the lab's liquid as is.
// Max heat and gravity scale with the height, as the lab's 6200 and 500 at 900 px; the lamp's max
// heat sits under the lab's (Robert: "we need to bring the max temp down just a smidge, I think
// that's the whole reason we get too aggressive rises", then his share link at 7233 for a 1294 px
// window), 5030 at 900 px.
export const LAB_AREA_PER_PARTICLE = 360 * 900 / 3050
// 3000 visible (was 6000): with the fine liquid the pots below hold about as much again, and a
// CPU lamp carrying 12300 particles on a desktop window ran at 14 fps and a tenth of its speed
// (Robert, of the ?cpu lamp: "the cpu one looks really bad"). The CPU is the fallback for
// browsers without WebGPU: fewer, coarser particles at full speed.
export const CPU_PARTICLES = 3000
// On the GPU backend the budget is ten times the CPU's: 60000 particles is about 12 ms a step
// on Robert's Apple GPU, and a desktop window wants 30000 at the lab's own grain.
export const GPU_PARTICLES = 60000
let budget = CPU_PARTICLES
// Which lamp is running: the defaults below differ by backend, since the CPU lamp is coarser
// (its grain is liquidScale times the lab's) and Robert tuned it on its own (2026-10-31, a share
// link at radius 69: "let's make these the cpu defaults for now"). GPU defaults are unchanged.
let backend = 'cpu'
export const setBackend = kind => { backend = kind; budget = kind === 'gpu' ? GPU_PARTICLES : CPU_PARTICLES }
const cpu = () => backend === 'cpu'
const liquidScale = (width, height) => Math.sqrt(Math.max(1, width * height / LAB_AREA_PER_PARTICLE / budget))
export const computeDefaultParticleCount = (width, height) => Math.min(Math.trunc(width * height / LAB_AREA_PER_PARTICLE), budget)
// CPU: 10 per unit of scale, half the lab's grain against the budget (Robert's radius 34 where the
// formula gave 69): finer lava for the same 3000 particles, a smaller pool.
// CPU 17.6 per unit: Robert's Radius 53 at scale 3 (2026-11-01, "these are the final settings for cpu version").
export const computeDefaultInteractionRadius = (width, height) => Math.round((cpu() ? 17.6 : 25) * liquidScale(width, height)) // GPU 25 (was 20): Robert's current settings, 2026-11-01
// Size 6 and Smooth 4 at radius 20 are Robert's lamp defaults of 2026-10-31 ("let's make these the
// new defaults", a share link); the lab draws its own at 3 and 3.
// Robert, 2026-10-31, with the reservoirs back on the GPU: "size and smooth should default to 3 also" (were 6 and 4).
// CPU: 0.87 per unit of scale, Robert's Size 3 at radius 34 (his third link, 2026-11-01: "update the
// default to something nice similar to what I had there but fixed"; was 1.45, Size 5 at radius 69).
export const computeDefaultParticleSize = (width, height) => Math.round((cpu() ? 3 : 4) * liquidScale(width, height)) // CPU 3 per unit: Robert's Size 9 at scale 3 (final CPU settings; was 0.87); GPU 4 (was 3): his current settings, 2026-11-01
// Smooth 7 and Blend 28 (Robert, 2026-10-31, with the two blurs apart: "smooth 7, blend 28"; Smooth was 3).
// CPU: Smooth 0 (Robert's CPU share link).
export const computeDefaultSmooth = (width, height) => Math.round((cpu() ? 4.33 : 7) * liquidScale(width, height)) // CPU 4.33 per unit: Robert's Smooth 13 at scale 3 (final CPU settings; was 0)
// Stiff and Near scale with the grain as well. Clavet's displacement per neighbour is dt² times
// stiffness times a dimensionless kernel sum, so in px it does not grow with the radius while
// the spacing does: at radius 43 the liquid tuned at 20 relaxed at less than half its strength
// against its own spacing, soft and slow (the CPU lamp on a desktop window). Scaling both with
// the radius keeps each step's move the same fraction of the spacing. At scale 1, which is every
// phone and every desktop window on the GPU, nothing changes.
// Pull is Stiff times Density folded into one knob (2026-11-01). Measured on the CPU solver at
// Robert's window: the pool's kernel density sits near 6.6 (the GPU's near 25) against a rest
// density of 406 (360.1), so pressure is always about minus Stiff times Density and never
// changes sign; Stiff 10.4 with Density 203, 2.6 with 812 and 5.2 with 406 all gave a spacing
// of 7.6 to 7.7 px. Two knobs that moved the same thing (Robert: "it makes tuning much more
// difficult... yeah, let's combine them"). The solver still takes stiffness and restDensity:
// restDensity is pinned at REST_DENSITY and stiffness is Pull over it, which keeps the pull
// within 0.7% of the old lamps on both backends. GPU 2700 per unit of scale (was Stiff 7.5
// times Density 360.1), CPU 706 (1.74 times 406; Robert's fourth link at scale 3: 5.2 times 406).
// Old saves and links that carry stiffness and restDensity are folded on load (applySettings).
export const REST_DENSITY = 400
export const computeDefaultPull = (width, height) => Math.round((cpu() ? 382.7 : 2700) * liquidScale(width, height)) // CPU 382.7 per unit: Robert's Pull 1150 at scale 3 (final CPU settings; was 706)
const legacyStiffness = (width, height) => Math.round((cpu() ? 1.74 : 7.5) * liquidScale(width, height) * 10) / 10
const legacyRestDensity = () => cpu() ? 406 : 360.1
export const computeDefaultStiffnessNear = (width, height) => Math.round((cpu() ? 146.8 : 1101) * liquidScale(width, height)) // CPU 146.8 per unit: Robert's Near 441 at scale 3 (final CPU settings; 647 at his fourth link)
// Blend 0 (Robert, once the heat table had 2048 steps: "set default blend to 0. not sure we even need
// blend anymore, it's insanely smooth at 2048"); the bands it blurred away were the 48 step table.
export const computeDefaultBlend = (width, height) => 0
// CPU: Max Temp 1200 at a 1226 px window (Robert's fourth link, "new baseline for cpu"), 881 at 900:
// lava that never gets much more than one and three quarter gravities buoyant (was 25038, 18470 at 900).
export const computeDefaultMaxTemp = height => Math.round((cpu() ? 1003 : 5030) * height / 900) // CPU 1003 at 900 px: Robert's 1366 at 1226 px (final CPU settings; was 881)
// Density and Conduct are fixed on the GPU and Robert's CPU link has them at 406 and 0.08.
export const computeDefaultConduction = () => cpu() ? 0.05 : 0.07 // CPU 0.05 (final CPU settings; 0.06 at the fourth link, 0.04 before)
// Heat (the pulse period) and Element (an element's heat) by backend: Robert's third link has Heat
// 33 and Element 69. Element stays at his 69: with Cap 1.5 and Lift 2, Element 8, 20, 40 and 69 all
// read 0.6 to 1.0 lone particles a sample and all lift lava to the ceiling (two lamp minutes each).
export const computeDefaultHeatSpots = () => cpu() ? 4 : 15 // CPU 4 (final CPU settings; 8 at the fourth link, 33 before)
export const computeDefaultElementHeat = () => cpu() ? 7 : 8 // CPU 7 (final CPU settings; 4 at the fourth link, 69 before)
// Burn, Pulses and Core by backend as well, from the same link: 7.5 s, 3 and 0.08 on the CPU.
export const computeDefaultElementLife = () => cpu() ? 7 : 15 // CPU 7 (final CPU settings; was 7.5)
// Turb, Eddies, Kick and Viscosity became backend-aware with Robert's final CPU settings
// (Turb 150, Eddies 6, Kick 10, Viscosity 9 against the GPU's 45, 2, 6, 32). Then Turb 150 and
// Eddies 6 went to the GPU too (Robert, 2026-11-01: "also make turb 150 and eddies 6 default on
// gpu version"); they stay as functions beside the others.
// GPU Turb 600 and Eddies 1 (Robert, 2026-11-03: "these are the new defaults for v2"; his link
// said 300 because the knob stopped there when it was made, "uhhh my turb is set to 600"): one
// strong eddy on a quiet lamp. The CPU lamp keeps 150 and 6.
export const computeDefaultTurbulence = () => cpu() ? 150 : 600
export const computeDefaultDrifters = () => cpu() ? 6 : 1 // Robert, 2026-11-03: "I meant to have that at 1 for the default" (his final link said 2)
export const computeDefaultWobbleKick = () => cpu() ? 10 : 6
export const computeDefaultViscosity = () => cpu() ? 9 : 32
export const computeDefaultElementRate = () => cpu() ? 3 : 4
export const computeDefaultElementCore = () => cpu() ? 0.08 : 0.1
// Reserve: how much lava the floor pots may hold, as a multiple of the visible lava; 8 is no
// cap. The pots are sized by the window, not the grain, so on the CPU at Robert's radius 34
// they held 14000 particles under 3000 visible (the GPU holds 25000 under 35000) and the step
// took 55 ms against the 37 ms a pace of 0.45 allows: the lamp ran in slow motion and the heat
// pulses came "so spaced out on cpu for some reason". CPU default 1, GPU unchanged (no cap).
export const computeDefaultReserve = () => cpu() ? 1 : 8
export const defaultReserve = fnstate(computeDefaultReserve())
export const reserve = fnstate(defaultReserve())
// Pixels: the renderer's pixel budget in megapixels. A big window is drawn at about half
// resolution within one megapixel, which makes a Size under 4 a single pixel dot, so the knob
// stopped doing anything there (Robert: "it seems like there's a floor on particle size,
// anything under 4 doesn't change anything on cpu"). Not saved: a way of drawing, not a look.
// Lift: the most buoyancy a particle may carry, in gravities; 10 is no cap (see LIFT_CAP in
// simulation.js). CPU default 2: at the coarse grain a particle heated at the line outran the
// liquid (3.5 gravities measured at Robert's link) and sprayed into the ceiling bottles ("it
// forms like little spouts that just spray"). GPU none, its look untouched. Saved and shared.
export const computeDefaultLift = () => cpu() ? 2 : 10
export const defaultLift = fnstate(computeDefaultLift())
export const lift = fnstate(defaultLift())
export const defaultPixels = 1
export const pixels = fnstate(defaultPixels)
// Auto Pixels: the lamp picks Pixels itself to hold a frame rate, stepping down when the frame
// falls under Target and up, never past the window's own size, when it runs well over it
// (Robert: "what if we do like a auto adjusting fps? Like goal is 35 fps, then we reduce pixels
// until we hit the target fps or better"). Touching the Pixels knob turns it off.
export const autoPixels = fnstate(true)
export const defaultTargetFps = 35
export const targetFps = fnstate(defaultTargetFps)
// Which lamp is running, for the panel (Robert: "we should display which backend is being used
// in the advance settings (so I can be sure I'm using cpu)").
export const backendLabel = fnstate('')
// Whether the screen is being kept awake and whether the motion sensors are heard, for the
// panel: on a phone neither can be seen from the laptop (Robert: "there's no accelerometer
// detection on mobile, and the screen lock no longer works on my android phone"), and both
// depend on the page being a secure context, so the phone says what it has.
export const screenLabel = fnstate('Screen: tap the lamp once to keep it awake')
// Frames a second, counted in the frame loop and written once a second (Robert: "let's add
// something to show fps in settings as long as it's computationally cheap").
export const fpsLabel = fnstate('')
export const motionLabel = fnstate('')
export const computeDefaultGravity = height => Math.round(500 * height / 900)

export const defaultBgColor = { r: 0, g: 0, b: 0 }
// The heat map's gradient, cold (sinking) to peak (hottest), and the flow field's, slow to fast.
// Robert: "the colors are now confusing with heat map as the default... Maybe we should show two
// different versions of color. One for heatmap to pick the gradient and one for no heat map to
// pick the static colors. the color would auto switch based on the heat map setting. could we
// also color the flow field with a gradient as well?"
// The Thermal theme is the default on both backends (Robert, 2026-11-01: "we need to make thermal
// the default in both cpu and gpu"): black through violet and red to yellow and white. Before it
// the default was Radar, the weather map Robert picked in the lamp (cold dark blue 0,20,117, cool
// green 68,255,0, warm orange 255,126,20, hot red, peak cream 255,255,230), and before that the
// infrared it started with; Radar stays in the themes list, second.
export const defaultHeatColors = {
  heatCold: { r: 0, g: 0, b: 0 },
  heatCool: { r: 90, g: 0, b: 130 },
  heatWarm: { r: 220, g: 30, b: 0 },
  heatHot: { r: 255, g: 220, b: 0 },
  heatPeak: { r: 255, g: 255, b: 255 }
}
// The arrows follow the theme: violet for the slowest flow through yellow for the fastest
// (Radar's were blue 0,55,255 through red).
export const defaultFlowSlow = { r: 90, g: 0, b: 130 }
export const defaultFlowFast = { r: 255, g: 220, b: 0 }
// Pull, once Stiff 7.5 against Density 360: the pull on every particle is close to their product,
// a constant cohesion, and Near is what holds the particles apart (Robert: "Ok, big finding,
// stiff has a relationship with density"). The old liquid was 4000, 25000 and 4.25 at radius 60.
export const defaultPull = fnstate(computeDefaultPull(window.innerWidth, window.innerHeight))
export const defaultStiffnessNear = fnstate(computeDefaultStiffnessNear(window.innerWidth, window.innerHeight))
// Peak speed of the convection roll that stirs the lava, in pixels per second. 0 turns it off.
export const defaultStir = 0 // the convection roll had no lanes left to break (Robert, 2026-11-02: "set it to zero and keep the knob")
// Conduction was 0.005 with a flat floor, where 0.02 was the top of the slider and a lamp that never
// lifted. With heating in depth the top became the lamp Robert wanted ("max needs to be the new mid
// and default. This is the mechanism we were missing for maximum lava gloopiness").
// 0.55 in the new liquid (was 0.02): a lump warms as one almost at once. Then 0.07 (Robert,
// 2026-10-31, "gloop at 0.07 is really nice"): at 0.55 a rising blob heated the pool under it
// through its neck, that lava rose after it and fed a long thin strand.
export const defaultConduction = fnstate(computeDefaultConduction()) // 0.07 on the GPU, see computeDefaultConduction
// Robert, with the lamp beside the video: "default pace needs ot be ~0.45 or so".
export const defaultPace = 0.45
export const defaultTurbulence = fnstate(computeDefaultTurbulence())
export const defaultDrifters = fnstate(computeDefaultDrifters())
export const defaultHeatSpots = fnstate(computeDefaultHeatSpots())
// How deep the ceiling cups are, as a fraction of each cup's width. 0 is a flat ceiling.
// Robert: "I don't want the reservoirs off by default". At the new liquid's spacing they hold a
// lamp's worth of lava (13500 hidden particles on a desktop window, 70 ms a step against 18
// without), which is the GPU's job to carry.
export const defaultCupDepth = 1
// Inertia: seconds for a particle's velocity to ease toward its drift. 0 is the overdamped wax the
// lamp was tuned as; above it, pinched necks snap back and freed blobs wobble.
export const defaultWobble = 0.87
// How much of the pressure step's move a particle carries on as velocity, and the most speed it
// may carry, in gravities.
export const defaultWobbleKick = fnstate(computeDefaultWobbleKick())
// CPU 1.5: at the coarse grain the kick launched single particles out of the pot necks at the
// cap, 3.4 gravities (2400 px/s measured at Robert's link, a spray of dots: "it forms like
// little spouts that just spray"); at 1.5 the top speed is 1060 px/s and the lone particles
// 0 to 3 a sample against 2 to 12. Kick 3 alone did nothing (0 to 18). GPU stays 3.4.
export const computeDefaultWobbleMax = () => cpu() ? 1.5 : 3.4
export const defaultWobbleMax = fnstate(computeDefaultWobbleMax())
// Edge smoothing: radius in px of the blur on the density field before the metaball threshold,
// which rounds off the bumps of the individual particles along every edge. 0 is the lamp as
// drawn before it existed; WebGL only.
// Relaxation passes per frame. 1 is the lamp as tuned; 2 evens the particle spacing so the
// outline is less bumpy, for most of a step's time again.
export const defaultSettle = 1
// Viscosity: how much of the approach between neighbouring particles is taken away per second
// (the paper's sigma). Needs Wobble above 0 to do anything. 0 is the lamp as tuned.
export const defaultViscosity = fnstate(computeDefaultViscosity())
// The most a relaxation step may move a particle, in radii (the check that keeps a high Density
// from flying apart); which particles count as skin and take the kick, as a fraction of the mean
// density (300: all of them, the paper's own velocity); and the margin from a side wall within
// which lava is eased off it, px.
// A fnstate because the backend sets it: 1 radius on the CPU, GPU_REACH on the GPU. On the GPU
// a cold pool held up by pressure exploded in pulses (the two half Jacobi moves resolve the
// floor's push only a few rows up, the column compresses and bursts, and Kick carries it);
// capping each pass at half a radius stopped it at no cost, measured 979 to 0 particles over
// 700 px/s. Robert: "rep, reach 0.5 fixed it. nice".
export const defaultReach = fnstate(1)
export const GPU_REACH = 0.5
export const defaultSkin = 300
export const defaultWall = 0
// The heater's elements against the new liquid (Robert: "the launching strips are back without
// the reservoirs, that was never a fix for the fluid behavior"): a lit element's heat per step at
// its core and how long a lighting burns, the tops of their ranges. The lab's finger, which
// pinches cleanly, is 48 per step for 3.4 s over 45 px; the elements were 3 to 8 for 5 to 15 s.
export const defaultElementHeat = fnstate(computeDefaultElementHeat())
export const defaultElementLife = fnstate(computeDefaultElementLife())
// These three follow the window, so they are state too. The app updates them on resize.
export const defaultParticleCount = fnstate(computeDefaultParticleCount(window.innerWidth, window.innerHeight))
export const defaultInteractionRadius = fnstate(computeDefaultInteractionRadius(window.innerWidth, window.innerHeight))
export const defaultParticleSize = fnstate(computeDefaultParticleSize(window.innerWidth, window.innerHeight))
export const defaultSmooth = fnstate(computeDefaultSmooth(window.innerWidth, window.innerHeight))
export const defaultMaxTemp = fnstate(computeDefaultMaxTemp(window.innerHeight))
export const defaultGravityStrength = fnstate(computeDefaultGravity(window.innerHeight))

export const bgColor = fnstate({ ...defaultBgColor })
export const heatCold = fnstate({ ...defaultHeatColors.heatCold })
export const heatCool = fnstate({ ...defaultHeatColors.heatCool })
export const heatWarm = fnstate({ ...defaultHeatColors.heatWarm })
export const heatHot = fnstate({ ...defaultHeatColors.heatHot })
export const heatPeak = fnstate({ ...defaultHeatColors.heatPeak })
export const flowSlow = fnstate({ ...defaultFlowSlow })
export const flowFast = fnstate({ ...defaultFlowFast })
export const interactionRadius = fnstate(defaultInteractionRadius())
export const gravityStrength = fnstate(defaultGravityStrength())
export const pull = fnstate(defaultPull())
export const stiffnessNear = fnstate(defaultStiffnessNear())
export const maxTemp = fnstate(defaultMaxTemp())
export const particleCount = fnstate(defaultParticleCount())
export const particleSize = fnstate(defaultParticleSize())
export const stir = fnstate(defaultStir)
export const conduction = fnstate(defaultConduction())
export const pace = fnstate(defaultPace)
export const turbulence = fnstate(defaultTurbulence())
export const drifters = fnstate(defaultDrifters())
export const heatSpots = fnstate(defaultHeatSpots())
export const cupDepth = fnstate(defaultCupDepth)
export const wobble = fnstate(defaultWobble)
export const wobbleKick = fnstate(defaultWobbleKick())
export const wobbleMax = fnstate(defaultWobbleMax())
export const smooth = fnstate(defaultSmooth())
// Blend: the blur on the colour inside the lava, separate from Smooth, which is the blur on the
// shape (Robert: "can we separately change the smooth/fuzz factor for the inside and outside of
// the lava? Inside a big smooth like 20 or 24 looks really good, but it makes the edges too fuzzy
// instead of crisp"). In lamp px, like Smooth.
export const defaultBlend = fnstate(computeDefaultBlend(window.innerWidth, window.innerHeight))
export const blend = fnstate(defaultBlend())
export const settle = fnstate(defaultSettle)
export const viscosity = fnstate(defaultViscosity())
export const reach = fnstate(defaultReach())
export const skin = fnstate(defaultSkin)
export const wall = fnstate(defaultWall)
export const elementHeat = fnstate(defaultElementHeat())
export const elementLife = fnstate(defaultElementLife())
// The rest of the heater's numbers (Robert: "the heaters get too hot for too long. We need some
// knobs to tweak the heater pulses and heat and such"): lightings per Heat interval, how much
// longer the biggest pot burns than the smallest, a lit pot's core width as a fraction of the
// shorter side, the floor's idle contact heat and its boost under a lit pot. The defaults are
// what the constants in simulation.js were.
export const defaultElementRate = fnstate(computeDefaultElementRate())
export const defaultElementLifeScale = 4
export const defaultElementCore = fnstate(computeDefaultElementCore())
export const defaultFloorHeat = 0.2
export const defaultFloorGlow = 2
export const elementRate = fnstate(defaultElementRate())
export const elementLifeScale = fnstate(defaultElementLifeScale)
export const elementCore = fnstate(defaultElementCore())
export const floorHeat = fnstate(defaultFloorHeat)
export const floorGlow = fnstate(defaultFloorGlow)
// The random seed: every random number in the lamp comes from it, so the same seed on the same
// window gives the same lamp. Drawn fresh on each load unless saved, shared or given as ?seed=.
// Shown in the panel so a lamp worth keeping can be saved. Changing it reloads the page, since
// the layout and the first lightings are already drawn by then.
export const randomSeed = () => Math.floor(Math.random() * 1e9)
export const seed = fnstate(randomSeed())
// Draw the stirring as arrows over the lamp. A way of looking, not a look: not shared, but
// remembered in this browser (see loadViews; Robert, 2026-11-01: "not all settings are being
// preserved on reload, very annoying... i.e. reservoirs being on").
export const showFlow = fnstate(false)
// Whether the lamp follows the device's motion: a shake of the phone (or of the window) shoves the
// lava, and turning the phone turns the floor. Off, the floor stays at the bottom and shakes are
// ignored (Robert: "for mobile, i think we should have an option to disable motion"). Remembered.
export const motionOn = fnstate(true)
// The Firefly switch: an unseen wanderer always looping through the lava, dropping tiny hot glints wherever it passes
// over it (sim/firefly.js), music or no music. Robert: "we should make a firefly lavalamp toggle that just runs the
// firefly all the time in the regular lamp"; "like, just a firefly that lives in the lava all the time". Off as shipped,
// so the lamp is as tuned; remembered in this browser like the other switches.
export const firefly = fnstate(false)
// The Ice fly switch: the firefly's cold twin (Robert: "add an ice fly that is a cold fire fly in all places"), an unseen
// wanderer looping round the hottest floating lava and dropping tiny cold glints there, so it cools what is hottest
// (sim/firefly.js ICE_TUNING). Its own switch beside the Firefly's, each independent; off as shipped, remembered and
// saved with the setup as the Firefly switch is.
export const iceFly = fnstate(false)
// The Dyed fluid switch: a dye carried through the water by the lamp's own flow and laid by every particle in its
// heat colour (render/dye.js), so the plumes and wakes show (Robert: "looks like watching radar, super cool";
// "we can add that as a layer on top of the lavalamp? like with another switch for something like, 'dyed fluid'?").
// A view only, it moves nothing. Off as shipped; remembered in this browser like the other switches, with its Dye
// pick (Under the lava, Over it as smoke, or Alone with the lava hidden), its Fade (the share of the dye gone each
// second) and its Stamp (how strongly each particle lays its colour).
export const dyedFluid = fnstate(false)
// Streamers in music mode: on by default whenever a music theme plays, whatever the switch above (Robert: "the streamers
// really make it feel alive in a fluid. not very lava lamp like, but I think we should turn it on by default in music
// mode"). Off here keeps them to the switch alone.
export const streamersInMusic = fnstate(true)
// Motion in music mode: off as shipped, so while a music theme plays the lamp's Motion is off on its live parameters
// and the device never tilts or shakes the lava (Robert: "music mode should turn off motion by default in the lamp");
// the saved Motion switch is not touched, and Music off puts it back. On here, Motion works under a theme as it does
// without one.
export const motionInMusic = fnstate(false)
export const dyeModes = ['under', 'over', 'alone']
export const dyeModeNames = { under: 'Under', over: 'Over', alone: 'Alone' }
// The streamers as Robert set them in his panel: Drawn Under, Fade 0.85, Stamp 0.05 (Robert: "make this the streamers
// default"; they were Alone, 0.8 and 0.15 from the deploy, and Under, 0.5 and 0.3 before that). Defaults only: a stored
// pick or knob is kept (the views).
export const defaultDyeMode = 'under'
export const dyeMode = fnstate(defaultDyeMode)
export const defaultDyeFade = 0.05
export const dyeFade = fnstate(defaultDyeFade)
// 1 since each particle stamps the lava's own smoothed colour (Robert: "the stamp fix is great, setting that to 1 finally
// makes the streamers look right and no pixelation"); it was 0.05 while each particle laid its own colour.
export const defaultDyeStamp = 1
export const dyeStamp = fnstate(defaultDyeStamp)
// How the streamers fade, for Robert to fiddle with (dye.js; Robert: "add a couple different controls for this so I can
// fiddle with it and then I'll probably pick a single control with a slider and defaults for the others"). Curve: dim
// dye fades faster than bright; Tail cut: a fixed amount off every bit of dye a second; Glow: the streamers' drawn
// brightness, bent softly under full. The defaults, with Fade 0.05, are Robert's for Vibes ("make these the default
// streamer settings for vibes": Fade 5%/s, Stamp 1, Curve 1, Tail cut 0.90/s, Glow 3x; before that 70%/s, 0.28/s, 2x);
// the streamers as they first were are Curve 0, Tail cut 0, Glow 1.
export const defaultDyeCurve = 1
export const dyeCurve = fnstate(defaultDyeCurve)
export const defaultDyeCut = 0.9
export const dyeCut = fnstate(defaultDyeCut)
export const defaultDyeGlow = 3
export const dyeGlow = fnstate(defaultDyeGlow)
// Static colors (render/staticColors.js; Robert: "having the color not be based on [heat], but instead a fixed gradient
// and a fixed color for every particle. I bet some really interesting color patterns emerge from nowhere", then "could be
// a view setting, 'static colors'"): every particle drawn in one place on the heat gradient for life, dealt by its
// height (bands that the flow marbles), across the lamp, or at random. A view only, it moves nothing. Off as shipped;
// remembered in this browser, kept in a theme's View switches and carried by a share link, as the other View switches are.
export const staticColors = fnstate(false)
export const staticColorsBys = STATIC_BYS
export { staticColorsByNames }
export const defaultStaticColorsBy = 'height'
export const staticColorsBy = fnstate(defaultStaticColorsBy)
// Layered (simulation.js layerScale; Robert: "What if instead of plain static, we do it by density and vary the density
// of the particles on a gradient that matches the color gradient. Then it has a natural order", then "we probably need
// some advanced tuning knobs in the settings for particle density where can fiddle with the relationship to the
// gradient"): with Static colors on, each particle weighs by its colour, so the cold lava sorts itself into layers.
// Shown as Density (it was Layered; the key stays staticColorsLayered, so saves and links still read). Robert,
// 2026-11-11, with Static colors on and Layered at 0: "Where's the density color. also none of the static colors appear
// to support density... like, ligther paritcles (hot) are less dense, but at a constant rate instead of like heating".
// So density is part of Static colors now, on at DEFAULT_DENSITY whenever the switch is; with the switch off the lamp
// is as tuned, whatever the knob says (app.js layeredNow).
// Density is the spread in gravities from the heaviest colour to the lightest, 0 off; Center the
// place on the gradient that weighs exactly gravity; Curve a power on the place; Bands, 2 or more, that many weights
// instead of a smooth run; Reverse the cold end lightest. It moves the lava, but it belongs to Static colors, so it is
// kept with it: remembered, in a theme's View switches and carried by a share link.
// The defaults are Robert's tuning, 2026-11-11 (Robert: "I got it tuned so now we get these neat gradient globs. These
// should be the default for the "static colors" in the view page"): Height, Density 2, Center 0.3, Curve 1.55, Smooth,
// not reversed, Mass 0.25, Heat take 2, Cling 0.15. Before they were Density 1, Center 0.5, Curve 1 and the physics at 0.
export const defaultStaticColorsLayered = 2
export const staticColorsLayered = fnstate(defaultStaticColorsLayered)
export const defaultLayerCenter = 0.3
export const layerCenter = fnstate(defaultLayerCenter)
export const defaultLayerCurve = 1.55
export const layerCurve = fnstate(defaultLayerCurve)
export const defaultLayerBands = 0
export const layerBands = fnstate(defaultLayerBands)
export const layerReverse = fnstate(false)
// Density physics (simulation.js densityMass; Robert: "also I wanted controls for controlling the phsyics of the
// density, please add those controls"): how the colours' weights act beyond moving each one's neutral buoyancy. Mass,
// heavy lava taking less of every pressure move; Heat take, heavy lava heating and cooling slower; Cling, unlike colours
// holding to each other less than like ones. Each does nothing at 0; kept with Static colors.
export const defaultDensityMass = 0.25
export const densityMass = fnstate(defaultDensityMass)
export const defaultDensityHeat = 2
export const densityHeat = fnstate(defaultDensityHeat)
export const defaultDensityCling = 0.15
export const densityCling = fnstate(defaultDensityCling)
// Fly fade (render/staticColors.js fly; Robert: "we hsoul dhave the flys change the density instead of heat when static
// color is enabled"): with Static colors on, the Firefly and Ice fly switches' glints move the colours they touch
// instead of their heat, and a moved colour eases back to the one it was dealt over this many seconds (95% of the way),
// as a glint's heat fades. Kept with Static colors.
export const defaultStaticFlyFade = 4
export const staticFlyFade = fnstate(defaultStaticFlyFade)
// Draw the heater strip and the heating elements along the floor, in either view. Remembered.
export const showHeater = fnstate(false)
// Pull the whole lamp into frame, hidden cups and all, scaled down, with the cup outlines drawn.
// Remembered. Robert: "add a toggle to move the cups into the frame so I can observe their behavior".
export const showCups = fnstate(false)
// Sound from the lava, synthesised as it moves. Not saved: browsers want a click before audio anyway.
export const sound = fnstate(false)
export const soundPending = fnstate(false) // on while the audio is starting, for the switch to show it
export const soundBeds = ['simmer', 'glug', 'noise', 'hum', 'none']
export const soundBed = fnstate('simmer')
// The lamp listening to music (Robert: "one thing I would love is a music sync"). Music on is
// kept by Save and a link, and remembered in this browser as it was left (MUSIC_KEY below; Robert:
// "If it's enabled in the settings, it should stay enabled if it was saved or shared"); the source is
// remembered too. The depths are numbers saved and shared with the rest. Each depth is how much the music adds on top of the knob's value:
// Floor and Lift from the bass, Turb from the mids, Kick from the highs, and Beat is the chance
// that a beat lights a pot.
export const music = fnstate(false)
// The spectrum strip along the bottom, for seeing what the music sync hears (a view: remembered
// per browser, not in links or saves).
export const showSpectrum = fnstate(false)
// Each fly's last 6 s drawn as a fading line, fireflies orange and ice flies blue, for tuning how they fly (a view:
// remembered per browser, not in links or saves; Robert: "let's turn the trails off behind a flag so we can get it back
// if there's future changes needed").
export const showFlyTrails = fnstate(false)
export const musicPending = fnstate(false)
// Why Music is on but hears nothing, '' while it hears or is off: 'tap' (waiting for a click, as a browser starts no
// microphone, screen share or sound without one), 'file' (the File source with no song in this browser), or what
// stopped the last start or the listening (music.js errorKind: 'cancelled', 'noaudio', 'ended', 'denied' and the
// rest). The lamp shows a prompt with a Try again for it (app.js) instead of switching Music off.
export const musicWait = fnstate('')
// A phone can only hear the room, so it gets the microphone alone (Robert: "Phones using mic is
// fine, makes more sense for mobile too").
// A computer can also play a song file itself, and record the lamp to it (Robert: "now we're
// ready to record the video with music synced to the lava lamp").
export const musicSources = (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) ? ['mic'] : ['mic', 'system', 'file']
export const musicFileName = fnstate('') // the chosen song's name, '' for none (the file itself is not kept)
export const musicRecording = fnstate(false)
export const musicSource = fnstate('mic')
// The music theme (Robert: "we have music themes like the color themes"): what the lamp does with the music it hears.
// Vibes (its id live), the default, is Robert's tuned set (src/sync/themes/live.json; Robert: "Pull the current settings one last time
// and let's get it ready to go live as the live music sync."): every lane fires its theme's effects through the sync
// engine (src/sync) over a still lamp, with a sparkle on every tick and the glow following the music, and the lamp's own
// music moves off. Calm is Vibes with both event switches off (musicFlowEvents and musicHeatEvents below; Robert: "The
// calm is just set both events to disabled and leave sparkle and glow on"): the same theme's data, its sparkle on every
// tick, its glow follow and its streamers, and no lane's motion or heat, the lamp glowing and glinting with the music and
// nothing else moving it. Picking Calm sets both switches off and picking Vibes sets both on; a switch changed by hand
// after keeps the pick. Calm had a theme file of its own (lamp-only.json, the two layers alone, every lane off), gone
// with it; a stored lamp-only reads as Calm. The names are Robert's ("music theme 'lamp only' should just be 'calm',
// live should be 'vibes'"); Vibes keeps its id so a stored pick still reads. Classic, the lamp's own music moves as they were before the themes, is gone from the pick (Robert:
// "I don't think we need classic music mode"): its code stays in app.js for ?hooks and the plain lamp, and a stored
// classic reads as Vibes (loadViews). Remembered in this browser, and kept by Save with Music and the source.
export const musicThemes = ['live', 'calm']
export const musicThemeNames = { live: 'Vibes', calm: 'Calm' }
export const musicTheme = fnstate('live')
const themeId = t => t === 'classic' ? 'live' : t === 'lamp-only' ? 'calm' : t // Robert: "I don't think we need classic music mode"; lamp-only was Calm's id
// The theme's effects, four controls over everything a theme does to the lava (Robert: "I had two mega sliders I want for
// music, under a section titled 'effects', flow strength and heat strength. I think we could also add checkboxes for
// turning off global sparkle and glow."). Flow strength (Robert: "flow strength"): every motion the theme gives the lamp
// times it, its eddies' spin and speed, its touches' push, pull and spin, its splats' throw and its ring waves' push
// (src/sync/kit.js, where each reaches the simulation); 1 as tuned, 0 moves nothing, 2 twice as hard. Heat strength
// (Robert: "heat strength"): every heat the theme gives times it, its pot blasts' strength and lift, its touches' heat
// and their cold alike, so heat and cold stay in balance (the sparkles, the glints, the glow's heat spots, the heat
// sweep, the cold sides); 1 as tuned, 0 heats nothing. Not the Firefly switch's own fly, which is the lamp's. Sparkle
// (Robert: "turning off global sparkle"): off stops the sparkle on every tick, the layer only, so a lane's Sparkle effect
// still fires. Glow (Robert: "and glow"): off stops the glow following the music and its heat spots; a lane's Glow pulse
// still fires. Kept by Save and links with the theme, and remembered in this browser as the theme is.
export const defaultMusicFlow = 1
export const musicFlow = fnstate(defaultMusicFlow)
export const defaultMusicHeat = 1
export const musicHeat = fnstate(defaultMusicHeat)
export const musicSparkle = fnstate(true)
export const musicGlow = fnstate(true)
// Flow events and Heat events (Robert: "ooo two more toggles, heat events and flow events. We really only have these two
// things, we should allow disabling heat or flow events, some people may not like that so much"): on as shipped. An event
// is anything a lane fires (a tick's or a hold's effect, from a type, a lane or a Scene effect); off, Flow events drops
// every motion an event gives the lamp (eddies, flow touches, splats, rings, the held push and eddy, a big moment's flow)
// and Heat events every heat or cold (pot blasts and lightings, vents, heat and cold touches, a glow pulse's heat, a big
// moment's blast and cold side), in the kit (src/sync/kit.js) beside the strengths. The song wide layers, the sparkle
// on every tick and the glow follow, are not events and stay as Sparkle and Glow say. Kept by Save and links with the
// theme, and remembered in this browser as it is.
export const musicFlowEvents = fnstate(true)
export const musicHeatEvents = fnstate(true)
// Picking Calm sets both off, Vibes both on (above); a change of the pick only, so a save or a link that carries the
// switches puts them back after its theme (they come after it in musicSettings and viewSettings).
// The Streamers in music switch goes with them (Robert: "calm should turn streamers off, and vibes should turn it on").
{ let was = musicTheme(); musicTheme.subscribe(t => { if (t === was) return; was = t; const on = t !== 'calm'; musicFlowEvents(on); musicHeatEvents(on); streamersInMusic(on) }) }
// There was a Detector setting here (musicDetector: Original, as tuned, or Demucs trained, music.js
// with the options fitted against split tracks on) while Robert listened to both. Demucs trained is
// now the only detector, on in music.js itself (Robert: "let's make the demucs trained detector the
// only detector for now, we don't need the old one any more"). A stored musicDetector in the views
// is skipped by loadViews, as any key not in viewSettings is.
export const defaultMusicSensitivity = 1
export const musicSensitivity = fnstate(defaultMusicSensitivity)
// Every this many beats a pot fires and, if there is room, an eddy is born, so the lamp moves on
// the phrase (Robert: "have pots instant fire to every n beats like, every 8 bass hits or so, so
// it's on tempo"; "make the n beats knob for sure"). It replaced a 20% chance a beat, which never
// read as on tempo.
export const defaultMusicEvery = 8
export const musicEvery = fnstate(defaultMusicEvery)
// Each sync's frequency range in Hz, its own Lo and Hi, to dial a song in.
// Robert: "I think we should also vary pace with the tempo... not a ton, but a bit"; "Bass notes should also be able to
// spawn eddies, more energetic music should have eddies more often"; "pulse waves from the
// center of the eddy on some of them instead of rotating. Like bass notes should cause a wave,
// and maybe high hat type hits trigger the rotations". Tempo: how far the pace follows the
// tempo against 120 bpm (0 not at all, 1 fully, held to 0.75 to 1.3 times). Pulse: the chance a
// bass hit sends a wave. Spawn: the chance, times how energetic the music is, that a bass hit
// brings an eddy. Spin: the same for a hi-hat bringing a spinning eddy.
export const defaultMusicMotion = { tempo: 0.5, pulse: 0.5, spawn: 0.5, spin: 0.25 }
export const musicTempo = fnstate(defaultMusicMotion.tempo)
export const musicPulse = fnstate(defaultMusicMotion.pulse)
export const musicSpawn = fnstate(defaultMusicMotion.spawn)
export const musicSpin = fnstate(defaultMusicMotion.spin)
// Ahead of the beat and with the song's sections (Robert: "it would be better to like preheat for
// a bass hit so that blobs and eddies and such would launch exactly at the base hit or drop...
// parts that are in between drops should show less activity and high energy sections with all
// the instruments and such should show more activity"). Lead: seconds before a predicted beat
// a pot is lit, so the blob lifts on it (0 fires as heard); an eddy takes its
// own lead from how long it takes to spin up. Activity: how far the song's sections scale the
// lamp, 0 not at all, 1 from nearly still in a breakdown to twice as busy in the fullest part.
export const defaultMusicLead = 1
export const musicLead = fnstate(defaultMusicLead)
export const defaultMusicActivity = 0.8
export const musicActivity = fnstate(defaultMusicActivity)
// The lidded pots: one pot is always closed and superheating, and on the beat (every Every, and
// the first kick after a breakdown, the drop) the lid comes off and it is blasted, so a hot glob
// leaves on the beat as heard (Robert: "close the pot and super heat it? then just delete the lid
// and have it take of instantly?"; "Then we'd want to prepare another pot to match a coming
// beat"). Drop scales the heat and the blast; 0 goes back to pots lit Lead seconds ahead.
export const defaultMusicDrop = 1
export const musicDrop = fnstate(defaultMusicDrop)
// The boom: a deep sub bass note opens a pot while the song is busy (Robert, on C-C after the
// drop: "there's like this deep BWOONNNNNGGGG sound, and I would expect some lava bursts to be
// timed with those"). Boom scales its blast; 0 is off.
export const defaultMusicBoom = 1
export const musicBoom = fnstate(defaultMusicBoom)
// Eddies at least this many while the song is busy, the Eddies knob kept if it is already more
// (Robert: "high energy parts can have a minimum of 3 eddies when in music sync mode. We should
// only raise the floor to three, not increase it if it's already higher"). 0 leaves Eddies alone.
export const defaultMusicBusyEddies = 3
// Flip: the chance a drop turns an eddy's spin round, once in its life; a boom does it at an
// eighth of that (see app.js), so most eddies swing round on a drop and a few on the deep notes
// (Robert: "it should have a higher chance of flipping eddie direction at a drop"). 0 is off.
export const defaultMusicFlip = 0.8
export const musicFlip = fnstate(defaultMusicFlip)
// Wobble: while a dubstep wah is sweeping (music.js, the wobble), an eddy comes in on its 2nd to
// 4th note, then every 2 to 6 notes, divided by Wobble (Robert: "trigger eddies more
// frequently"). 0 is off.
export const defaultMusicWobble = 1
export const musicWobble = fnstate(defaultMusicWobble)
// The bass shaker: the whole lamp rocked sideways by the bass (Robert: "making the whole platform
// wobble for very deep bass notes... for frequencies like 80hz or less, we shake the platform at
// like 10x less rate, so 80hz would shake the platform 8x/second"; "let's try both and compare, or
// possibly keep both with different triggers"). Shake: by a sub note (under 80 Hz) at its pitch
// over ten, as hard as the note is loud. Shake beat: by the kick, twice a beat, locked to the
// tempo like a synth's LFO. 0 is off.
// Sections: how hard the lamp answers the song's parts around a drop (sections.js): a snare roll
// or a riser winds the drop's pot up, a roll's end and an impact fire it, half time turns the
// eddies, a key change is a drop. 0 is off.
export const defaultMusicSections = 1
export const musicSections = fnstate(defaultMusicSections)
// Vent: the chance a beat lifts the charged pot's lid for a moment, a puff of its lava out (see
// app.js). 0 is off.
export const defaultMusicVent = 0.15
export const musicVent = fnstate(defaultMusicVent)
export const musicBusyEddies = fnstate(defaultMusicBusyEddies)
export const defaultMusicRanges = { beatLo: 40, beatHi: 150, heatLo: 40, heatHi: 150, eddyLo: 150, eddyHi: 2000, kickLo: 2000, kickHi: 8000 }
export const musicBeatLo = fnstate(defaultMusicRanges.beatLo)
export const musicBeatHi = fnstate(defaultMusicRanges.beatHi)
export const musicHeatLo = fnstate(defaultMusicRanges.heatLo)
export const musicHeatHi = fnstate(defaultMusicRanges.heatHi)
export const musicEddyLo = fnstate(defaultMusicRanges.eddyLo)
export const musicEddyHi = fnstate(defaultMusicRanges.eddyHi)
export const musicKickLo = fnstate(defaultMusicRanges.kickLo)
export const musicKickHi = fnstate(defaultMusicRanges.kickHi)
export const defaultMusicFloor = 1.5
export const musicFloor = fnstate(defaultMusicFloor)
export const defaultMusicLift = 0.5
export const musicLift = fnstate(defaultMusicLift)
export const defaultMusicTurb = 1
export const musicTurb = fnstate(defaultMusicTurb)
export const defaultMusicKick = 0.5
export const musicKick = fnstate(defaultMusicKick)
// The lamp over the whole screen, no browser around it (Robert: "a full screen mode that has no
// border"). Not saved: the browser forgets fullscreen on reload anyway. Follows the browser too,
// so Esc flips the switch back.
export const fullscreen = fnstate(false)
// iPhone Safari has no page fullscreen (only a video's), so there the switch gives way to a ? with the steps to the
// lamp with nothing around it (Robert: "also full screen doesn't work on ios"): added to the Home Screen, it opens as an
// app with no browser around it (index.html, src/home/manifest.json, homeScreen.js). Whether this browser can make the
// page fullscreen, and whether the lamp is already running from the Home Screen, where neither is shown.
export const pageFullscreenWorks = typeof document !== 'undefined' && !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)
export const fromHomeScreen = typeof window !== 'undefined' && (window.navigator.standalone === true || ['standalone', 'fullscreen'].some(mode => window.matchMedia(`(display-mode: ${mode})`).matches))
// The steps under View's title, open while the ? is pressed (settingsPanel.js).
export const fullscreenHow = fnstate(false)
// What a finger on the lamp does. Not saved.
export const touchModes = ['push', 'pull', 'spin', 'heat', 'cool']
export const touchMode = fnstate('push')
// How hard a finger acts, a multiplier on the push, pull and spin speeds and on the heat and
// cool (Robert: "we need a touch effect strength slider under the touch").
export const defaultTouchStrength = 1
export const touchStrength = fnstate(defaultTouchStrength)
// How the eddies travel: born at Speed px/s (times a random 0.7 to 1.3), falling off with age by
// the Curve at the Fall off rate (Robert: "Can I get knobs for the motion? initial speed, fall
// off rate, linear/logarithmic/exponential fall off").
// Robert's numbers from his link (2026-11-02: "high speed with exponential drop off was the right
// move"): 400 px/s, falling off exponentially at 1.7.
export const defaultEddySpeed = 400
export const eddySpeed = fnstate(defaultEddySpeed)
export const defaultEddyFalloff = 0.6 // final v2 link (was 1.7)
export const eddyFalloff = fnstate(defaultEddyFalloff)
export const eddyCurves = ['log', 'linear', 'exp']
export const defaultEddyCurve = 'exp'
export const eddyCurve = fnstate(defaultEddyCurve)
// Rim pull in and Splat pull in (Robert, 2026-11-07: "the outside of the vortex dissipates faster than the center";
// "all the eddies should work that way, I think, the splats would be a lot nicer if they shrank in like that too, but
// probably much faster"): how far an eddy's reach pulls in to its core over its life, and how thin a splat's legs narrow
// to spikes over its (Robert, of the ring pulled in first: "now we're getting roughly rounded blobs ... we should keep
// the strength but just shrink the expanding blobs"); 0 is the old look exactly (simulation.js pullOf, splatNarrow).
export const defaultEddyPullIn = 0.6
export const eddyPullIn = fnstate(defaultEddyPullIn)
export const defaultSplatPullIn = 0.6
export const splatPullIn = fnstate(defaultSplatPullIn)

// Themes: a name and every colour at once, the heat gradient, the back and the flow arrows
// (Robert: "themes that set all of the colors"). Six contrast presets, gradients that jump hue
// like the defaults (Robert: "we just have 6 preset contrast themes like weather"); the two colour
// and luminance gradients are made from a swatch or two instead, below. Thermal, first, is the
// defaults above (Robert: "radar and thermal should swap spots"); Radar (was Weather, renamed at
// Robert's request) was the default before it. The rest are Claude's first draft for Robert to
// repaint. Applying one just sets the colour states, so Save and Share carry the result.
// Backgrounds (Robert: "We should probably pick a few different backgrounds from black for the
// themes too, to illustrate the difference. like probably acid with a cool contrasting color, lava
// with like a nearly black brown color, like a cave, radar stays black, neon probably a dark
// blurple, spectrum black, thermal black").
const rgb = (r, g, b) => ({ r, g, b })
export const themes = [
  { name: 'Thermal', heatCold: rgb(0, 0, 0), heatCool: rgb(90, 0, 130), heatWarm: rgb(220, 30, 0), heatHot: rgb(255, 220, 0), heatPeak: rgb(255, 255, 255), bgColor: rgb(0, 0, 0), flowSlow: rgb(90, 0, 130), flowFast: rgb(255, 220, 0) },
  { name: 'Spectrum', heatCold: rgb(114, 0, 255), heatCool: rgb(0, 176, 255), heatWarm: rgb(44, 255, 0), heatHot: rgb(249, 255, 0), heatPeak: rgb(255, 0, 0), bgColor: rgb(0, 0, 0), flowSlow: rgb(30, 0, 90), flowFast: rgb(255, 230, 0), heatCoolAt: 0.261, heatWarmAt: 0.5, heatHotAt: 0.739 },
  // Neon as Robert painted it, his "neonest" theme, with its own places along the heat (were the even 0.25, 0.5, 0.75):
  { name: 'Neon', heatCold: rgb(0, 0, 0), heatCool: rgb(0, 174, 255), heatWarm: rgb(255, 0, 191), heatHot: rgb(255, 188, 2), heatPeak: rgb(235, 225, 139), bgColor: rgb(15, 10, 40), flowSlow: rgb(0, 120, 160), flowFast: rgb(255, 230, 0), heatCoolAt: 0.248, heatWarmAt: 0.44, heatHotAt: 0.674 },
  // Radar renamed Fluoro and repainted to Robert's "radarded" (Robert: "is the new default setting for radar. let's also
  // rename radar to Flourescent, unless that's too long then a shorter word that means the same thing"): Fluoro, the
  // short form, fits the picker beside the others. Then his "flourtarded": the peak ffa855 and the stops 0.359, 0.477, 0.74.
  { name: 'Fluoro', heatCold: rgb(0, 71, 255), heatCool: rgb(68, 255, 0), heatWarm: rgb(255, 126, 20), heatHot: rgb(255, 95, 0), heatPeak: rgb(255, 0, 0), bgColor: rgb(0, 0, 0), flowSlow: rgb(0, 55, 255), flowFast: rgb(255, 40, 40), heatCoolAt: 0.316, heatWarmAt: 0.449, heatHotAt: 0.7 },
  // Nightbloom, Robert's own, takes Lava's slot (Robert: "Nightbloom, i like it"; his "barny the dinosour" scheme,
  // replacing Lava): a violet cool, an amber warm, a green hot and a teal peak on black, with its own places along the heat.
  { name: 'Nightbloom', heatCold: rgb(0, 0, 0), heatCool: rgb(90, 0, 130), heatWarm: rgb(191, 105, 18), heatHot: rgb(27, 137, 75), heatPeak: rgb(26, 91, 96), bgColor: rgb(0, 0, 0), flowSlow: rgb(90, 0, 130), flowFast: rgb(255, 220, 0), heatCoolAt: 0.25, heatWarmAt: 0.5, heatHotAt: 0.72 },
  { name: 'Acid', heatCold: rgb(0, 0, 0), heatCool: rgb(20, 140, 20), heatWarm: rgb(120, 240, 0), heatHot: rgb(230, 255, 60), heatPeak: rgb(52, 255, 0), bgColor: rgb(255, 255, 255), flowSlow: rgb(0, 80, 20), flowFast: rgb(240, 255, 100), heatCoolAt: 0.16, heatWarmAt: 0.327, heatHotAt: 0.84 }
]
// Neon before it was repainted, so a setup still on it to the letter (its colours and the even places) is moved to the
// new Neon as it loads (adoptNewNeon); a Neon edited by hand is kept.
const NEON_BEFORE = { heatCold: rgb(0, 40, 60), heatCool: rgb(0, 220, 255), heatWarm: rgb(255, 0, 200), heatHot: rgb(255, 230, 0), heatPeak: rgb(255, 255, 255), bgColor: rgb(22, 14, 58), flowSlow: rgb(0, 120, 160), flowFast: rgb(255, 230, 0), heatCoolAt: 0.25, heatWarmAt: 0.5, heatHotAt: 0.75 }
export const applyTheme = theme => {
  for (const [key, state] of Object.entries(colorSettings)) if (theme[key]) state({ ...theme[key] })
  if (AT_KEYS.some(k => k in theme)) putPlaces(theme)
}

// The heat colours: five stops, Cold and Peak at the ends and Cool, Warm and Hot at places along
// the heat that the panel's pins set. History of the panel (settingsPanel.js): Duotone and Mono
// (Robert: "maybe we should make like a two color gradient version and luminance gradient"), one
// From and To gradient, a midpoint slider, three pins, the five dots on the bar, no Presets and
// Gradient switch, then no preview and apply at all, themes as starting points with a check
// before one replaces changed colours.
// Where Cool, Warm and Hot sit along the heat, 0 to 1, saved with the colours: the renderers
// draw the gradient through the five at their places (overlays.js heatColor). The pins were first
// read off as five even steps, and moving one barely changed the lava (Robert: "the gradient
// rendering doesn't change on the lava itself when I change how the gradient applies").
export const heatCoolAt = fnstate(0.25)
export const heatWarmAt = fnstate(0.5)
export const heatHotAt = fnstate(0.75)
const AT_KEYS = ['heatCoolAt', 'heatWarmAt', 'heatHotAt']
const places = [heatCoolAt, heatWarmAt, heatHotAt]
const EVEN = [0.25, 0.5, 0.75]
// The places as they are, and set, for a saved theme.
export const takePlaces = () => Object.fromEntries(AT_KEYS.map((k, i) => [k, places[i]()]))
export const putPlaces = theme => AT_KEYS.forEach((k, i) => places[i](Number(theme[k]) > 0 && Number(theme[k]) < 1 ? Number(theme[k]) : EVEN[i]))

// These keys are the saved and shared JSON format, so they must not change.
// lavaColor and lavaHighlight were here until 2026-10-31, when the heat map became the only
// view (Robert: "I think this now completely replaces the non heat map mode. we should get rid
// of the heat map toggle, make heat map the default, and remove the code for the old color
// mode"); old saves and links that still carry them are simply ignored.
const colorSettings = { bgColor, heatCold, heatCool, heatWarm, heatHot, heatPeak, flowSlow, flowFast }
const numberSettings = { heatCoolAt, heatWarmAt, heatHotAt, interactionRadius, gravityStrength, pull, stiffnessNear, maxTemp, particleCount, particleSize, stir, conduction, pace, turbulence, drifters, heatSpots, cupDepth, wobble, wobbleKick, wobbleMax, smooth, blend, settle, viscosity, reach, skin, wall, elementHeat, elementLife, elementRate, elementLifeScale, elementCore, floorHeat, floorGlow, reserve, lift, touchStrength, eddySpeed, eddyFalloff, eddyPullIn, splatPullIn, musicSensitivity, musicEvery, musicFloor, musicLift, musicTurb, musicKick, musicBeatLo, musicBeatHi, musicHeatLo, musicHeatHi, musicEddyLo, musicEddyHi, musicKickLo, musicKickHi, musicTempo, musicPulse, musicSpawn, musicSpin, musicLead, musicActivity, musicDrop, musicBoom, musicBusyEddies, musicFlip, musicWobble, musicVent, musicSections, seed }
// Settings that may be zero or negative. Everything else has to be positive to make sense.
// touchStrength and eddyFalloff: their knobs go to 0 (found by the round trip check, 2026-11-03).
const signedSettings = new Set(['stir', 'conduction', 'turbulence', 'drifters', 'heatSpots', 'cupDepth', 'wobble', 'smooth', 'blend', 'wall', 'floorHeat', 'floorGlow', 'viscosity', 'wobbleKick', 'touchStrength', 'eddyFalloff', 'eddyPullIn', 'splatPullIn', 'musicTempo', 'musicPulse', 'musicSpawn', 'musicSpin', 'musicLead', 'musicActivity', 'musicDrop', 'musicBoom', 'musicBusyEddies', 'musicFlip', 'musicWobble', 'musicVent', 'musicSections', 'musicFloor', 'musicLift', 'musicTurb', 'musicKick']) // viscosity and wobbleKick: their knobs go to 0 and a saved 0 was dropped (2026-11-01)

const defaults = () => ({
  bgColor: { ...defaultBgColor },
  heatCold: { ...defaultHeatColors.heatCold },
  heatCool: { ...defaultHeatColors.heatCool },
  heatWarm: { ...defaultHeatColors.heatWarm },
  heatHot: { ...defaultHeatColors.heatHot },
  heatPeak: { ...defaultHeatColors.heatPeak },
  flowSlow: { ...defaultFlowSlow },
  flowFast: { ...defaultFlowFast },
  heatCoolAt: 0.25,
  heatWarmAt: 0.5,
  heatHotAt: 0.75,
  interactionRadius: defaultInteractionRadius(),
  gravityStrength: defaultGravityStrength(),
  pull: defaultPull(),
  stiffnessNear: defaultStiffnessNear(),
  maxTemp: defaultMaxTemp(),
  particleCount: defaultParticleCount(),
  particleSize: defaultParticleSize(),
  stir: defaultStir,
  conduction: defaultConduction(),
  pace: defaultPace,
  turbulence: defaultTurbulence(),
  drifters: defaultDrifters(),
  heatSpots: defaultHeatSpots(),
  cupDepth: defaultCupDepth,
  wobble: defaultWobble,
  wobbleKick: defaultWobbleKick(),
  wobbleMax: defaultWobbleMax(),
  smooth: defaultSmooth(),
  blend: defaultBlend(),
  settle: defaultSettle,
  viscosity: defaultViscosity(),
  reach: defaultReach(),
  skin: defaultSkin,
  wall: defaultWall,
  elementHeat: defaultElementHeat(),
  elementLife: defaultElementLife(),
  elementRate: defaultElementRate(),
  elementLifeScale: defaultElementLifeScale,
  elementCore: defaultElementCore(),
  floorHeat: defaultFloorHeat,
  floorGlow: defaultFloorGlow,
  reserve: defaultReserve(),
  lift: defaultLift(),
  // These were missing, so Reset left them where they were (found 2026-11-03).
  touchStrength: defaultTouchStrength,
  eddySpeed: defaultEddySpeed,
  eddyFalloff: defaultEddyFalloff,
  eddyPullIn: defaultEddyPullIn,
  splatPullIn: defaultSplatPullIn,
  eddyCurve: defaultEddyCurve,
  musicSensitivity: defaultMusicSensitivity,
  musicEvery: defaultMusicEvery,
  musicFloor: defaultMusicFloor,
  musicLift: defaultMusicLift,
  musicTurb: defaultMusicTurb,
  musicKick: defaultMusicKick,
  musicBeatLo: defaultMusicRanges.beatLo,
  musicBeatHi: defaultMusicRanges.beatHi,
  musicHeatLo: defaultMusicRanges.heatLo,
  musicHeatHi: defaultMusicRanges.heatHi,
  musicEddyLo: defaultMusicRanges.eddyLo,
  musicEddyHi: defaultMusicRanges.eddyHi,
  musicKickLo: defaultMusicRanges.kickLo,
  musicKickHi: defaultMusicRanges.kickHi,
  musicTempo: defaultMusicMotion.tempo,
  musicPulse: defaultMusicMotion.pulse,
  musicSpawn: defaultMusicMotion.spawn,
  musicSpin: defaultMusicMotion.spin,
  musicLead: defaultMusicLead,
  musicActivity: defaultMusicActivity,
  musicDrop: defaultMusicDrop,
  musicBoom: defaultMusicBoom,
  musicBusyEddies: defaultMusicBusyEddies,
  musicFlip: defaultMusicFlip,
  musicWobble: defaultMusicWobble,
  musicSections: defaultMusicSections,
  musicVent: defaultMusicVent,
  music: false,
  musicTheme: 'live',
  musicSource: 'mic',
  musicFlow: defaultMusicFlow,
  musicHeat: defaultMusicHeat,
  musicSparkle: true,
  musicGlow: true,
  musicFlowEvents: true,
  musicHeatEvents: true,
  seed: randomSeed()
})

// Every save and every link carries the version it was made on (Robert: "going forward, links
// and settings need to always include the version"), so the root page can open the lamp it
// belongs to.
// Music mode is part of a save and a link (Robert: "music mode doesn't get saved on when save is clicked, it should be
// saveable"): Music on or off, its theme and its source. A setup that comes back with Music on waits for the first
// click or key on the page before it listens (app.js), since a browser starts no microphone, screen share or sound
// without one; a file source plays the song the page kept last, or asks for one.
// The theme's effects with them (musicFlow, musicHeat, musicSparkle, musicGlow, musicFlowEvents, musicHeatEvents): the two strengths any number 0 to 2.
const EFFECT_STRENGTH = [0, 2]
const strengthOk = v => typeof v === 'number' && v >= EFFECT_STRENGTH[0] && v <= EFFECT_STRENGTH[1]
const musicChoices = () => ({ music: [true, false], musicTheme: musicThemes, musicSource: musicSources, musicFlow: strengthOk, musicHeat: strengthOk, musicSparkle: [true, false], musicGlow: [true, false], musicFlowEvents: [true, false], musicHeatEvents: [true, false] })
const musicSettings = { music, musicTheme, musicSource, musicFlow, musicHeat, musicSparkle, musicGlow, musicFlowEvents, musicHeatEvents }
export const getSettings = () => {
  const result = { version: CURRENT }
  for (const [key, state] of Object.entries({ ...colorSettings, ...numberSettings })) result[key] = state()
  result.eddyCurve = eddyCurve()
  for (const [key, state] of Object.entries(musicSettings)) result[key] = state()
  return result
}

// Missing or unusable keys leave the current value alone, so old saved settings and partial share
// links still load. Numbers are coerced because older versions saved slider values as strings.
export const applySettings = saved => {
  // Saves and links from before Pull carry stiffness and restDensity: fold them into Pull, one
  // or both (a lone one takes the default of its day for the other).
  if (!(Number(saved.pull) > 0) && (Number(saved.stiffness) > 0 || Number(saved.restDensity) > 0)) {
    const s = Number(saved.stiffness) > 0 ? Number(saved.stiffness) : legacyStiffness(window.innerWidth, window.innerHeight)
    const d = Number(saved.restDensity) > 0 ? Number(saved.restDensity) : legacyRestDensity()
    saved = { ...saved, pull: Math.round(s * d) }
  }
  for (const [key, state] of Object.entries(colorSettings)) {
    if (saved[key]) state({ ...saved[key] })
  }
  if (eddyCurves.includes(saved.eddyCurve)) eddyCurve(saved.eddyCurve)
  for (const [key, state] of Object.entries(numberSettings)) {
    const value = Number(saved[key])
    if (Number.isFinite(value) && (value > 0 || signedSettings.has(key))) state(value)
  }
  const music = { ...saved, musicTheme: themeId(saved.musicTheme) }
  for (const [key, state] of Object.entries(musicSettings)) { if (!(key in music)) continue; const ok = musicChoices()[key], v = typeof ok === 'function' && typeof music[key] === 'string' ? Number(music[key]) : music[key]; if (typeof ok === 'function' ? ok(v) : ok.includes(v)) state(v) }
}

// Radar before it became Fluoro, so a setup still on it to the letter (its colours and the even places) moves to Fluoro.
const RADAR_BEFORE = { heatCold: rgb(0, 20, 117), heatCool: rgb(68, 255, 0), heatWarm: rgb(255, 126, 20), heatHot: rgb(255, 0, 0), heatPeak: rgb(255, 255, 230), bgColor: rgb(0, 0, 0), flowSlow: rgb(0, 55, 255), flowFast: rgb(255, 40, 40), heatCoolAt: 0.25, heatWarmAt: 0.5, heatHotAt: 0.75 }
// Fluoro's first colours (a darker blue cold, red hot, a peach peak), so a setup still on them moves to the new Fluoro.
const FLUORO_BEFORE = { heatCold: rgb(0, 20, 117), heatCool: rgb(68, 255, 0), heatWarm: rgb(255, 126, 20), heatHot: rgb(255, 0, 0), heatPeak: rgb(255, 168, 85), bgColor: rgb(0, 0, 0), flowSlow: rgb(0, 55, 255), flowFast: rgb(255, 40, 40), heatCoolAt: 0.359, heatWarmAt: 0.477, heatHotAt: 0.74 }
// Spectrum before Robert's Mine 3 (a dark purple cold, teal, yellow, red, a white peak), so a setup still on it moves to the new Spectrum.
const SPECTRUM_BEFORE = { heatCold: rgb(30, 0, 90), heatCool: rgb(0, 170, 170), heatWarm: rgb(255, 230, 0), heatHot: rgb(230, 30, 0), heatPeak: rgb(255, 255, 255), bgColor: rgb(0, 0, 0), flowSlow: rgb(30, 0, 90), flowFast: rgb(255, 230, 0), heatCoolAt: 0.25, heatWarmAt: 0.5, heatHotAt: 0.75 }
// Acid before Robert's acider (black cold, a lime peak on white), so a setup still on it to the letter moves to the new Acid.
const ACID_BEFORE = { heatCold: rgb(0, 30, 0), heatCool: rgb(20, 140, 20), heatWarm: rgb(120, 240, 0), heatHot: rgb(230, 255, 60), heatPeak: rgb(255, 255, 230), bgColor: rgb(38, 10, 62), flowSlow: rgb(0, 80, 20), flowFast: rgb(240, 255, 100), heatCoolAt: 0.25, heatWarmAt: 0.5, heatHotAt: 0.75 }
// Lava before Robert's Nightbloom took its slot (a dark red cold through orange to a cream peak on a cave brown), so a
// setup still on it to the letter (its colours and the even places) moves to Nightbloom.
const LAVA_BEFORE = { heatCold: rgb(40, 0, 0), heatCool: rgb(160, 20, 0), heatWarm: rgb(255, 90, 0), heatHot: rgb(255, 200, 40), heatPeak: rgb(255, 255, 220), bgColor: rgb(28, 15, 8), flowSlow: rgb(120, 40, 0), flowFast: rgb(255, 220, 120), heatCoolAt: 0.25, heatWarmAt: 0.5, heatHotAt: 0.75 }
const adoptNewNeon = () => {
  const now = { ...Object.fromEntries(Object.entries(colorSettings).map(([k, st]) => [k, st()])), ...takePlaces() }
  const same = (a, b) => typeof a === 'number' ? Math.abs(a - b) < 1e-9 : a && b && a.r === b.r && a.g === b.g && a.b === b.b
  if (Object.keys(NEON_BEFORE).every(k => same(now[k], NEON_BEFORE[k]))) applyTheme(themes.find(t => t.name === 'Neon'))
  else if (Object.keys(RADAR_BEFORE).every(k => same(now[k], RADAR_BEFORE[k]))) applyTheme(themes.find(t => t.name === 'Fluoro'))
  else if (Object.keys(ACID_BEFORE).every(k => same(now[k], ACID_BEFORE[k]))) applyTheme(themes.find(t => t.name === 'Acid'))
  else if (Object.keys(FLUORO_BEFORE).every(k => same(now[k], FLUORO_BEFORE[k]))) applyTheme(themes.find(t => t.name === 'Fluoro'))
  else if (Object.keys(SPECTRUM_BEFORE).every(k => same(now[k], SPECTRUM_BEFORE[k]))) applyTheme(themes.find(t => t.name === 'Spectrum'))
  else if (Object.keys(LAVA_BEFORE).every(k => same(now[k], LAVA_BEFORE[k]))) applyTheme(themes.find(t => t.name === 'Nightbloom'))
}

export const resetSettings = () => applySettings(defaults())

// Saves are kept per backend: the two lamps are tuned apart, and one store served both until
// 2026-11-01, when a Save from the CPU tab came back as the GPU lamp's settings (Robert: "seems
// like you replaced the gpu defaults with the cpu settings?"). The GPU keeps the old key, so
// GPU saves from before still load; the CPU starts fresh.
// Each version keeps its own saves (Robert: "Their old local storage settings need to maintain
// all versions of settings independently so they can always go back"): v1, the 2023 lamp, owns
// 'lavalamp.app-settings' and is never touched; this version has its own keys. A v2 save made
// under the old key before the split (the GPU lamp used it until 2026-11-02) is copied over
// once, never moved, and told apart from a v1 save by a key v1 never had.
const LEGACY_KEY = 'lavalamp.app-settings'
const LEGACY_CPU_KEY = 'lavalamp.app-settings-cpu'
const storageKey = () => cpu() ? `lavalamp.app-v${CURRENT}-settings-cpu` : `lavalamp.app-v${CURRENT}-settings`
const looksLikeThisVersion = text => {
  try { const o = JSON.parse(text); return !!o && (o.version === CURRENT || 'pull' in o || 'turbulence' in o || 'cupDepth' in o || 'heatSpots' in o) } catch { return false }
}
const adoptLegacySave = () => {
  try {
    if (localStorage.getItem(storageKey())) return
    const old = localStorage.getItem(cpu() ? LEGACY_CPU_KEY : LEGACY_KEY)
    if (old && looksLikeThisVersion(old)) localStorage.setItem(storageKey(), old)
  } catch {}
}

// The views: ways of looking at the lamp, and the touch mode and sound bed. Not part of a save or
// a share link (a link is a look), but remembered in this browser as soon as they change, so a
// reload comes back the way it was left. Sound and Fullscreen are not: browsers want a click.
const VIEW_KEY = `lavalamp.app-v${CURRENT}-views`
const viewSettings = { showFlow, motionOn, firefly, iceFly, dyedFluid, staticColors, staticColorsBy, staticColorsLayered, layerCenter, layerCurve, layerBands, layerReverse, densityMass, densityHeat, densityCling, staticFlyFade, streamersInMusic, motionInMusic, dyeMode, dyeFade, dyeStamp, dyeCurve, dyeCut, dyeGlow, showHeater, showCups, touchMode, soundBed, autoPixels, targetFps, musicSource, musicTheme, musicFlow, musicHeat, musicSparkle, musicGlow, musicFlowEvents, musicHeatEvents, showSpectrum, showFlyTrails }
const viewChoices = { staticColorsBy: STATIC_BYS, dyeMode: dyeModes, touchMode: touchModes, soundBed: soundBeds, musicSource: musicSources, musicTheme: musicThemes }
const saveViews = () => {
  try {
    const out = {}
    for (const [key, state] of Object.entries(viewSettings)) out[key] = state()
    out.densityOn = true // written since Density came on by default; see loadViews
    out.globsOn = true // written since the gradient globs became the defaults; see loadViews
    localStorage.setItem(VIEW_KEY, JSON.stringify(out))
  } catch {}
}
const loadViews = () => {
  try {
    const views = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}')
    if ('musicTheme' in views) views.musicTheme = themeId(views.musicTheme)
    // Views saved before Density came on by default hold Layered 0 for every browser that never touched it (all
    // the views are saved together), which would hide the density there: those take the new default once.
    if (!views.densityOn && views.staticColorsLayered === 0) delete views.staticColorsLayered
    // Views saved before the gradient globs became the defaults hold the old ones in every browser that saved any
    // view: if every Static colors knob there is still at an old default (Density 1, or 0 from before densityOn,
    // Center 0.5, Curve 1, Bands Smooth, not reversed, Mass, Heat take and Cling 0; a knob not saved counts as at its
    // default), the knobs take the new defaults, once: the next save writes globsOn. If any one was moved, the set was
    // picked on purpose and is kept whole. Dealt by is the same Height either way and is left as saved.
    if (!views.globsOn) {
      const was = { staticColorsLayered: 1, layerCenter: 0.5, layerCurve: 1, layerBands: 0, layerReverse: false, densityMass: 0, densityHeat: 0, densityCling: 0 }
      if (Object.entries(was).every(([key, old]) => !(key in views) || views[key] === old)) for (const key in was) delete views[key]
    }
    for (const [key, state] of Object.entries(viewSettings)) {
      if (!(key in views)) continue
      const choices = viewChoices[key]
      if (choices ? choices.includes(views[key]) : typeof views[key] === 'boolean' || Number.isFinite(views[key])) state(views[key])
    }
  } catch {}
  for (const state of Object.values(viewSettings)) state.subscribe(saveViews)
}

// Music on or off as it was last left in this browser, over the saved setup and under a link, so a reload comes back
// listening (or waiting for the click that lets it) without a Save.
const MUSIC_KEY = `lavalamp.app-v${CURRENT}-music-on`
// Views first, then saved settings, then a share link on top if the URL has one.
export const loadSavedSettings = () => {
  loadViews()
  adoptLegacySave()
  const saved = localStorage.getItem(storageKey())
  if (saved) {
    try {
      applySettings(JSON.parse(saved))
      adoptNewNeon()
    } catch {
      localStorage.removeItem(storageKey())
    }
  }
  try { const was = localStorage.getItem(MUSIC_KEY); if (was === 'on' || was === 'off') music(was === 'on') } catch {}
  music.subscribe(on => { try { localStorage.setItem(MUSIC_KEY, on ? 'on' : 'off') } catch {} }) // a link's too, below
  const query = new URLSearchParams(window.location.search)
  const shared = query.get('shared')
  if (shared) {
    try {
      applySettings(JSON.parse(atob(shared)))
    } catch {
      notify('Invalid Share URL')
    }
  }
  const short = query.get('s')
  if (short) {
    try {
      applyChanged(JSON.parse(fromBase64Url(short)))
    } catch {
      notify('Invalid Share URL')
    }
  }
  // ?seed= wins over everything: it is how a seed change reloads into effect.
  const asked = Number(query.get('seed'))
  if (Number.isFinite(asked) && query.has('seed')) seed(Math.floor(asked) >>> 0)
  seedRandom(seed())
}

// Reload the page with this seed in the URL (keeping a share link if there is one), so the
// whole lamp is drawn from it.
export const reloadWithSeed = value => {
  const query = new URLSearchParams(window.location.search)
  query.set('seed', String(Math.floor(Number(value)) >>> 0))
  query.delete('profile')
  window.location.search = `?${query.toString()}`
}

// Forget the saved settings and the views, and start over with a fresh seed and a clean URL. The
// views were kept, so Heater and Reservoirs stayed on through a reset (Robert: "reset settings is
// apparently not working... I just reset and heater and reservoirs stayed on"); the button says
// it resets ALL defaults.
export const resetAndReload = () => {
  clearSavedSettings()
  try { localStorage.removeItem(VIEW_KEY); localStorage.removeItem(MUSIC_KEY) } catch {}
  window.location.href = window.location.pathname
}

// Saving also takes ?shared, ?s and ?seed out of the address: a share link is applied on top of the
// saved settings at every load, so with the link still in the address bar a save looked lost on
// reload (Robert: "saving settings does not survive a reload anymore"). ?cpu, ?profile and the
// rest stay.
export const saveSettings = () => {
  localStorage.setItem(storageKey(), JSON.stringify(getSettings()))
  const query = new URLSearchParams(window.location.search)
  if (query.has('shared') || query.has('s') || query.has('seed')) {
    query.delete('shared')
    query.delete('s')
    query.delete('seed')
    const rest = query.toString().replace(/=(?=&|$)/g, '') // ?cpu stays ?cpu, not ?cpu=
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? '?' + rest : ''}${window.location.hash}`)
  }
}

export const clearSavedSettings = () => localStorage.removeItem(storageKey())

// Short share links (Robert: "is there a way we could make the share url shorter? maybe we only send
// values that changed in the settings and otherwise leave the defaults?"): ?s= carries only what
// differs from the defaults, colours as six hex digits, and the seed always (it is the lamp's
// motion); opening one starts from the defaults and puts those on top, so it is the sender's lamp
// still, and the settings that follow the window (the particle count, the radius) are the opener's
// own. A default lamp with new colours is a link of a few dozen characters, where the full one was
// near two thousand. ?shared= (every setting) still loads, for the links already out there.
const toHex = c => [c.r, c.g, c.b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
const fromHex = h => /^[0-9a-f]{6}$/i.test(h) ? { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) } : null
const toBase64Url = text => btoa(unescape(encodeURIComponent(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromBase64Url = code => decodeURIComponent(escape(atob(code.replace(/-/g, '+').replace(/_/g, '/'))))
const changedSettings = () => {
  const now = getSettings()
  const base = defaults()
  const out = {}
  for (const key of Object.keys(colorSettings)) if (toHex(now[key]) !== toHex(base[key])) out[key] = toHex(now[key])
  for (const key of Object.keys(numberSettings)) {
    const a = Number(now[key]); const b = Number(base[key])
    if (key === 'seed' || !(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)))) out[key] = a
  }
  if (now.eddyCurve !== base.eddyCurve) out.eddyCurve = now.eddyCurve
  for (const key of Object.keys(musicSettings)) if (now[key] !== base[key]) out[key] = now[key]
  // The whole lamp (Robert: "we include the theme data in the share so they get the themes and all the settings all at
  // once"): the View switches, the show's switches and Advanced's own switches too, which a link left out before, and w,
  // which says the link has them, so the opener's are put to the defaults under them and an older link leaves them be.
  out.w = 1
  const views = linkViews(), viewBase = linkViewDefaults()
  for (const key of Object.keys(views)) if (!near(views[key](), viewBase[key])) out[key] = views[key]()
  return out
}
const linkViews = () => ({ ...viewSwitches, streamersInMusic, motionInMusic, ...advancedViews })
const linkViewDefaults = () => ({ ...viewDefaults(), streamersInMusic: true, motionInMusic: false, ...advancedViewDefaults() })
const applyChanged = changed => {
  const full = {}
  for (const [key, value] of Object.entries(changed)) full[key] = colorSettings[key] ? fromHex(String(value)) : value
  const base = defaults()
  delete base.seed
  applySettings(base)
  applySettings(full)
  if (changed.w) put(linkViews(), linkViewDefaults(), changed)
}
// extra: the theme data the panel adds (sharedExtras above).
export const shareLink = (extra = {}) =>
  `${window.location.origin}${window.location.pathname}?v=${CURRENT}&s=${toBase64Url(JSON.stringify({ ...changedSettings(), ...extra }))}`

// Whole lamp themes (Robert: "I think we also need to combine color, music, global toggles, and all modified advanced
// toggles into the themes"): the panel's Themes card keeps the colours, the show, the View switches and every Advanced
// setting that differs from its default; this is their data, the panel (settingsPanel.js, themeList.js) their lists.
// The show: the music theme and every effect setting over it (the Music card's My Shows). Its music theme comes first,
// since picking one sets the event and streamers switches, which come after it.
export const showSettings = { musicTheme, musicFlowEvents, musicHeatEvents, musicFlow, musicHeat, musicSparkle, musicGlow, streamersInMusic, motionInMusic, dyeMode, dyeFade, dyeStamp, dyeCurve, dyeCut, dyeGlow }
export const showDefaults = () => ({ musicTheme: 'live', musicFlowEvents: true, musicHeatEvents: true, musicFlow: defaultMusicFlow, musicHeat: defaultMusicHeat, musicSparkle: true, musicGlow: true, streamersInMusic: true, motionInMusic: false, dyeMode: defaultDyeMode, dyeFade: defaultDyeFade, dyeStamp: defaultDyeStamp, dyeCurve: defaultDyeCurve, dyeCut: defaultDyeCut, dyeGlow: defaultDyeGlow })
// The View card's switches and the lamp's own streamers' settings. Not Fullscreen: a browser forgets it on reload anyway.
export const viewSwitches = { showFlow, motionOn, firefly, iceFly, dyedFluid, staticColors, staticColorsBy, staticColorsLayered, layerCenter, layerCurve, layerBands, layerReverse, densityMass, densityHeat, densityCling, staticFlyFade, dyeMode, dyeFade, dyeStamp, dyeCurve, dyeCut, dyeGlow }
export const viewDefaults = () => ({ showFlow: false, motionOn: true, firefly: false, iceFly: false, dyedFluid: false, staticColors: false, staticColorsBy: defaultStaticColorsBy, staticColorsLayered: defaultStaticColorsLayered, layerCenter: defaultLayerCenter, layerCurve: defaultLayerCurve, layerBands: defaultLayerBands, layerReverse: false, densityMass: defaultDensityMass, densityHeat: defaultDensityHeat, densityCling: defaultDensityCling, staticFlyFade: defaultStaticFlyFade, dyeMode: defaultDyeMode, dyeFade: defaultDyeFade, dyeStamp: defaultDyeStamp, dyeCurve: defaultDyeCurve, dyeCut: defaultDyeCut, dyeGlow: defaultDyeGlow })
// Advanced: its knobs (every saved number but the heat places, which are the colours', Touch's strength and the seed,
// drawn fresh on every load), the eddies' curve, and its switches.
const advancedViews = { showHeater, showCups, showSpectrum, showFlyTrails, autoPixels, targetFps }
const advancedViewDefaults = () => ({ showHeater: false, showCups: false, showSpectrum: false, showFlyTrails: false, autoPixels: true, targetFps: defaultTargetFps })
const ADVANCED_NUMBERS = Object.keys(numberSettings).filter(k => !AT_KEYS.includes(k) && k !== 'touchStrength' && k !== 'seed')
const choicesOf = { musicTheme: musicThemes, dyeMode: dyeModes, staticColorsBy: STATIC_BYS, eddyCurve: eddyCurves }
const fits = (key, v, base) => choicesOf[key] ? choicesOf[key].includes(v) : typeof v === typeof base && (typeof v !== 'number' || Number.isFinite(v))
const near = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)) : a === b
const put = (states, base, values) => { for (const [k, st] of Object.entries(states)) { const v = k in values && fits(k, values[k], base[k]) ? values[k] : base[k]; if (st() !== v) st(v) } }
const take = states => Object.fromEntries(Object.entries(states).map(([k, st]) => [k, st()]))
export const takeShow = () => take(showSettings)
export const putShow = s => put(showSettings, showDefaults(), s)
export const takeView = () => take(viewSwitches)
export const putView = v => put(viewSwitches, viewDefaults(), v)
// Every Advanced setting's default, by key, and the ones that differ from it now.
export const advancedBase = () => { const d = defaults(); return { ...Object.fromEntries(ADVANCED_NUMBERS.map(k => [k, d[k]])), eddyCurve: d.eddyCurve, ...advancedViewDefaults() } }
export const takeAdvanced = () => {
  const base = advancedBase(), now = { ...Object.fromEntries(ADVANCED_NUMBERS.map(k => [k, numberSettings[k]()])), eddyCurve: eddyCurve(), ...take(advancedViews) }
  return Object.fromEntries(Object.keys(base).filter(k => !near(now[k], base[k])).map(k => [k, now[k]]))
}
export const cleanAdvanced = a => { const base = advancedBase(); const out = {}; for (const k of Object.keys(base)) if (a && k in a && fits(k, a[k], base[k]) && (typeof a[k] !== 'number' || a[k] > 0 || signedSettings.has(k) || k in advancedViews)) out[k] = a[k]; return out }
// Every Advanced setting to its default, then the theme's own on top, each set only if it moves.
export const putAdvanced = a => {
  const base = advancedBase(), want = { ...base, ...cleanAdvanced(a) }
  for (const k of ADVANCED_NUMBERS) if (!near(numberSettings[k](), want[k])) numberSettings[k](want[k])
  if (eddyCurve() !== want.eddyCurve) eddyCurve(want.eddyCurve)
  put(advancedViews, advancedViewDefaults(), want)
}
// The colours of a theme in one order (the panel compares themes by their JSON): the places, then the stops, back and arrows.
export const COLOUR_KEYS = ['heatCold', 'heatCool', 'heatWarm', 'heatHot', 'heatPeak', 'bgColor', 'flowSlow', 'flowFast']
const colourDefaults = () => ({ ...defaultHeatColors, bgColor: defaultBgColor, flowSlow: defaultFlowSlow, flowFast: defaultFlowFast })
export const normColours = t => {
  const d = colourDefaults(), out = {}
  AT_KEYS.forEach((k, i) => { out[k] = Number(t[k]) > 0 && Number(t[k]) < 1 ? Number(t[k]) : EVEN[i] })
  for (const k of COLOUR_KEYS) { const c = t[k] && [t[k].r, t[k].g, t[k].b].every(v => Number.isFinite(v) && v >= 0 && v <= 255) ? t[k] : d[k]; out[k] = { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) } }
  return out
}
// Short forms for a link: what differs from the defaults, colours as six hex digits, places to three decimals.
export const packColours = t => {
  const n = normColours(t), d = normColours({}), out = {}
  for (const k of AT_KEYS) if (!near(n[k], d[k])) out[k] = Math.round(n[k] * 1000) / 1000
  for (const k of COLOUR_KEYS) if (toHex(n[k]) !== toHex(d[k])) out[k] = toHex(n[k])
  return out
}
export const unpackColours = o => { const t = {}; for (const [k, v] of Object.entries(o || {})) t[k] = COLOUR_KEYS.includes(k) ? fromHex(String(v)) : v; return normColours(t) }
const packDiff = (values, base) => Object.fromEntries(Object.keys(base).filter(k => k in values && !near(values[k], base[k])).map(k => [k, values[k]]))
const unpackDiff = (o, base) => { const out = { ...base }; for (const k of Object.keys(base)) if (o && k in o && fits(k, o[k], base[k])) out[k] = o[k]; return out }
export const packShow = s => packDiff(s, showDefaults())
export const unpackShow = o => unpackDiff(o, showDefaults())
export const packView = v => packDiff(v, viewDefaults())
export const unpackView = o => unpackDiff(o, viewDefaults())
// The theme data a share link carries after the settings (_c a colour theme, _s a show, _t a whole theme), read by the
// panel as it opens: a name alone when the link's own settings are that theme, its short form when they are not.
export const sharedExtras = () => {
  const code = new URLSearchParams(window.location.search).get('s')
  if (!code) return null
  try { const o = JSON.parse(fromBase64Url(code)); return o._c || o._s || o._t ? { c: o._c, s: o._s, t: o._t } : null } catch { return null }
}
