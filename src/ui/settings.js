import { fnstate } from '@srfnstack/fntags'
import { notify } from './components.js'
import { seedRandom } from '../sim/random.js'

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
export const computeDefaultTurbulence = () => 150
export const computeDefaultDrifters = () => 6
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
export const defaultStir = 20
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
// The lamp over the whole screen, no browser around it (Robert: "a full screen mode that has no
// border"). Not saved: the browser forgets fullscreen on reload anyway. Follows the browser too,
// so Esc flips the switch back.
export const fullscreen = fnstate(false)
// What a finger on the lamp does. Not saved.
export const touchModes = ['push', 'pull', 'spin', 'heat', 'cool']
export const touchMode = fnstate('push')
// How hard a finger acts, a multiplier on the push, pull and spin speeds and on the heat and
// cool (Robert: "we need a touch effect strength slider under the touch").
export const defaultTouchStrength = 1
export const touchStrength = fnstate(defaultTouchStrength)

// Themes: a name and every colour at once, the heat gradient, the back and the flow arrows
// (Robert: "themes that set all of the colors"). Six contrast presets, gradients that jump hue
// like the defaults (Robert: "we just have 6 preset contrast themes like weather"); the two colour
// and luminance gradients are made from a swatch or two instead, below. Thermal, first, is the
// defaults above (Robert: "radar and thermal should swap spots"); Radar (was Weather, renamed at
// Robert's request) was the default before it. The rest are Claude's first draft for Robert to
// repaint. Applying one just sets the colour states, so Save and Share carry the result.
const rgb = (r, g, b) => ({ r, g, b })
export const themes = [
  { name: 'Thermal', heatCold: rgb(0, 0, 0), heatCool: rgb(90, 0, 130), heatWarm: rgb(220, 30, 0), heatHot: rgb(255, 220, 0), heatPeak: rgb(255, 255, 255), bgColor: rgb(0, 0, 0), flowSlow: rgb(90, 0, 130), flowFast: rgb(255, 220, 0) },
  { name: 'Spectrum', heatCold: rgb(30, 0, 90), heatCool: rgb(0, 170, 170), heatWarm: rgb(255, 230, 0), heatHot: rgb(230, 30, 0), heatPeak: rgb(255, 255, 255), bgColor: rgb(0, 0, 0), flowSlow: rgb(30, 0, 90), flowFast: rgb(255, 230, 0) },
  { name: 'Neon', heatCold: rgb(0, 40, 60), heatCool: rgb(0, 220, 255), heatWarm: rgb(255, 0, 200), heatHot: rgb(255, 230, 0), heatPeak: rgb(255, 255, 255), bgColor: rgb(5, 5, 15), flowSlow: rgb(0, 120, 160), flowFast: rgb(255, 230, 0) },
  { name: 'Radar', heatCold: rgb(0, 20, 117), heatCool: rgb(68, 255, 0), heatWarm: rgb(255, 126, 20), heatHot: rgb(255, 0, 0), heatPeak: rgb(255, 255, 230), bgColor: rgb(0, 0, 0), flowSlow: rgb(0, 55, 255), flowFast: rgb(255, 40, 40) },
  { name: 'Lava', heatCold: rgb(40, 0, 0), heatCool: rgb(160, 20, 0), heatWarm: rgb(255, 90, 0), heatHot: rgb(255, 200, 40), heatPeak: rgb(255, 255, 220), bgColor: rgb(8, 4, 4), flowSlow: rgb(120, 40, 0), flowFast: rgb(255, 220, 120) },
  { name: 'Acid', heatCold: rgb(0, 30, 0), heatCool: rgb(20, 140, 20), heatWarm: rgb(120, 240, 0), heatHot: rgb(230, 255, 60), heatPeak: rgb(255, 255, 230), bgColor: rgb(0, 0, 0), flowSlow: rgb(0, 80, 20), flowFast: rgb(240, 255, 100) }
]
export const applyTheme = theme => {
  for (const [key, state] of Object.entries(colorSettings)) if (theme[key]) state({ ...theme[key] })
}

// The other two kinds of gradient (Robert: "maybe we should make like a two color gradient
// version and luminance gradient"): Two tone runs the five stops from one colour to another,
// Luminance runs one colour from near black through itself to white. Mixed in linear light so
// the middle does not go muddy. The pickers below are not saved; the five stops they set are.
export const gradientKinds = ['presets', 'duotone', 'mono'] // six contrast presets; two colours; one colour dark to light
export const gradientKind = fnstate('presets')
export const gradientFrom = fnstate(rgb(0, 20, 117))
export const gradientTo = fnstate(rgb(255, 255, 230))
export const gradientHue = fnstate(rgb(255, 126, 20))
const toLinear = c => Math.pow(c / 255, 2.2)
const fromLinear = v => Math.round(Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2) * 255)
const mixLinear = (a, b, t) => ({ r: fromLinear(toLinear(a.r) * (1 - t) + toLinear(b.r) * t), g: fromLinear(toLinear(a.g) * (1 - t) + toLinear(b.g) * t), b: fromLinear(toLinear(a.b) * (1 - t) + toLinear(b.b) * t) })
const stops = [heatCold, heatCool, heatWarm, heatHot, heatPeak]
export const applyTwoTone = () => {
  const a = gradientFrom(); const b = gradientTo()
  stops.forEach((state, k) => state(mixLinear(a, b, k / 4)))
}
export const applyLuminance = () => {
  const c = gradientHue()
  const black = rgb(0, 0, 0); const white = rgb(255, 255, 255)
  stops[0](mixLinear(black, c, 0.12)); stops[1](mixLinear(black, c, 0.5)); stops[2]({ ...c }); stops[3](mixLinear(c, white, 0.5)); stops[4](mixLinear(c, white, 0.92))
}
gradientFrom.subscribe(() => { if (gradientKind() === 'duotone') applyTwoTone() })
gradientTo.subscribe(() => { if (gradientKind() === 'duotone') applyTwoTone() })
gradientHue.subscribe(() => { if (gradientKind() === 'mono') applyLuminance() })
gradientKind.subscribe(kind => { if (kind === 'duotone') applyTwoTone(); else if (kind === 'mono') applyLuminance() })

// These keys are the saved and shared JSON format, so they must not change.
// lavaColor and lavaHighlight were here until 2026-10-31, when the heat map became the only
// view (Robert: "I think this now completely replaces the non heat map mode. we should get rid
// of the heat map toggle, make heat map the default, and remove the code for the old color
// mode"); old saves and links that still carry them are simply ignored.
const colorSettings = { bgColor, heatCold, heatCool, heatWarm, heatHot, heatPeak, flowSlow, flowFast }
const numberSettings = { interactionRadius, gravityStrength, pull, stiffnessNear, maxTemp, particleCount, particleSize, stir, conduction, pace, turbulence, drifters, heatSpots, cupDepth, wobble, wobbleKick, wobbleMax, smooth, blend, settle, viscosity, reach, skin, wall, elementHeat, elementLife, elementRate, elementLifeScale, elementCore, floorHeat, floorGlow, reserve, lift, touchStrength, seed }
// Settings that may be zero or negative. Everything else has to be positive to make sense.
const signedSettings = new Set(['stir', 'conduction', 'turbulence', 'drifters', 'heatSpots', 'cupDepth', 'wobble', 'smooth', 'blend', 'wall', 'floorHeat', 'floorGlow', 'viscosity', 'wobbleKick']) // viscosity and wobbleKick: their knobs go to 0 and a saved 0 was dropped (2026-11-01)

const defaults = () => ({
  bgColor: { ...defaultBgColor },
  heatCold: { ...defaultHeatColors.heatCold },
  heatCool: { ...defaultHeatColors.heatCool },
  heatWarm: { ...defaultHeatColors.heatWarm },
  heatHot: { ...defaultHeatColors.heatHot },
  heatPeak: { ...defaultHeatColors.heatPeak },
  flowSlow: { ...defaultFlowSlow },
  flowFast: { ...defaultFlowFast },
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
  seed: randomSeed()
})

export const getSettings = () => {
  const result = {}
  for (const [key, state] of Object.entries({ ...colorSettings, ...numberSettings })) result[key] = state()
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
  for (const [key, state] of Object.entries(numberSettings)) {
    const value = Number(saved[key])
    if (Number.isFinite(value) && (value > 0 || signedSettings.has(key))) state(value)
  }
}

export const resetSettings = () => applySettings(defaults())

// Saves are kept per backend: the two lamps are tuned apart, and one store served both until
// 2026-11-01, when a Save from the CPU tab came back as the GPU lamp's settings (Robert: "seems
// like you replaced the gpu defaults with the cpu settings?"). The GPU keeps the old key, so
// GPU saves from before still load; the CPU starts fresh.
const storageKey = () => cpu() ? 'lavalamp.app-settings-cpu' : 'lavalamp.app-settings'

// The views: ways of looking at the lamp, and the touch mode and sound bed. Not part of a save or
// a share link (a link is a look), but remembered in this browser as soon as they change, so a
// reload comes back the way it was left. Sound and Fullscreen are not: browsers want a click.
const VIEW_KEY = 'lavalamp.app-views'
const viewSettings = { showFlow, showHeater, showCups, touchMode, soundBed }
const viewChoices = { touchMode: touchModes, soundBed: soundBeds }
const saveViews = () => {
  try {
    const out = {}
    for (const [key, state] of Object.entries(viewSettings)) out[key] = state()
    localStorage.setItem(VIEW_KEY, JSON.stringify(out))
  } catch {}
}
const loadViews = () => {
  try {
    const views = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}')
    for (const [key, state] of Object.entries(viewSettings)) {
      if (!(key in views)) continue
      const choices = viewChoices[key]
      if (choices ? choices.includes(views[key]) : typeof views[key] === 'boolean') state(views[key])
    }
  } catch {}
  for (const state of Object.values(viewSettings)) state.subscribe(saveViews)
}

// Views first, then saved settings, then a share link on top if the URL has one.
export const loadSavedSettings = () => {
  loadViews()
  const saved = localStorage.getItem(storageKey())
  if (saved) {
    try {
      applySettings(JSON.parse(saved))
    } catch {
      localStorage.removeItem(storageKey())
    }
  }
  const query = new URLSearchParams(window.location.search)
  const shared = query.get('shared')
  if (shared) {
    try {
      applySettings(JSON.parse(atob(shared)))
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

// Forget the saved settings and start over with a fresh seed and a clean URL.
export const resetAndReload = () => {
  clearSavedSettings()
  window.location.href = window.location.pathname
}

// Saving also takes ?shared and ?seed out of the address: a share link is applied on top of the
// saved settings at every load, so with the link still in the address bar a save looked lost on
// reload (Robert: "saving settings does not survive a reload anymore"). ?cpu, ?profile and the
// rest stay.
export const saveSettings = () => {
  localStorage.setItem(storageKey(), JSON.stringify(getSettings()))
  const query = new URLSearchParams(window.location.search)
  if (query.has('shared') || query.has('seed')) {
    query.delete('shared')
    query.delete('seed')
    const rest = query.toString().replace(/=(?=&|$)/g, '') // ?cpu stays ?cpu, not ?cpu=
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? '?' + rest : ''}${window.location.hash}`)
  }
}

export const clearSavedSettings = () => localStorage.removeItem(storageKey())

export const shareLink = () =>
  `${window.location.origin}${window.location.pathname}?shared=${btoa(JSON.stringify(getSettings()))}`
