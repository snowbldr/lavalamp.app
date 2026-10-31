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
// heat sits a smidge under the lab's (Robert: "we need to bring the max temp down just a smidge, I
// think that's the whole reason we get too aggressive rises"), 5500 at 900 px.
export const LAB_AREA_PER_PARTICLE = 360 * 900 / 3050
export const CPU_PARTICLES = 6000
// On the GPU backend the budget is ten times the CPU's: 60000 particles is about 12 ms a step
// on Robert's Apple GPU, and a desktop window wants 30000 at the lab's own grain.
export const GPU_PARTICLES = 60000
let budget = CPU_PARTICLES
export const setParticleBudget = n => { budget = n }
const liquidScale = (width, height) => Math.sqrt(Math.max(1, width * height / LAB_AREA_PER_PARTICLE / budget))
export const computeDefaultParticleCount = (width, height) => Math.min(Math.trunc(width * height / LAB_AREA_PER_PARTICLE), budget)
export const computeDefaultInteractionRadius = (width, height) => Math.round(20 * liquidScale(width, height))
export const computeDefaultParticleSize = (width, height) => Math.round(3 * liquidScale(width, height))
export const computeDefaultSmooth = (width, height) => Math.round(3 * liquidScale(width, height))
export const computeDefaultMaxTemp = height => Math.round(5500 * height / 900)
export const computeDefaultGravity = height => Math.round(500 * height / 900)

export const defaultBgColor = { r: 0, g: 0, b: 0 }
export const defaultLavaColor = { r: 133, g: 0, b: 204 }
export const defaultLavaHighlight = { r: 182, g: 124, b: 254 }
// The heat map's gradient, cold (sinking) to peak (hottest), and the flow field's, slow to fast.
// Robert: "the colors are now confusing with heat map as the default... Maybe we should show two
// different versions of color. One for heatmap to pick the gradient and one for no heat map to
// pick the static colors. the color would auto switch based on the heat map setting. could we
// also color the flow field with a gradient as well?"
// Robert picked these in the lamp and asked for them as the defaults: a weather map rather than
// the infrared it started with (cold sky blue, cool green, warm orange, hot red, peak cream).
export const defaultHeatColors = {
  heatCold: { r: 0, g: 20, b: 117 }, // was sky blue 0,191,255; Robert: "just darker blue, now that we get a lot colder"
  heatCool: { r: 68, g: 255, b: 0 },
  heatWarm: { r: 255, g: 126, b: 20 },
  heatHot: { r: 255, g: 0, b: 0 },
  heatPeak: { r: 255, g: 255, b: 230 }
}
// Robert's picks for the arrows: blue for the slowest flow through red for the fastest.
export const defaultFlowSlow = { r: 0, g: 55, b: 255 }
export const defaultFlowFast = { r: 255, g: 0, b: 0 }
// Stiff 7.5 against Density 360: the pull on every particle is close to their product, a constant
// cohesion, and Near is what holds the particles apart (Robert: "Ok, big finding, stiff has a
// relationship with density"). The old liquid was 4000, 25000 and 4.25 at radius 60.
export const defaultStiffness = 7.5
export const defaultStiffnessNear = 1101
export const defaultRestDensity = 360.1
// Peak speed of the convection roll that stirs the lava, in pixels per second. 0 turns it off.
export const defaultStir = 20
// Conduction was 0.005 with a flat floor, where 0.02 was the top of the slider and a lamp that never
// lifted. With heating in depth the top became the lamp Robert wanted ("max needs to be the new mid
// and default. This is the mechanism we were missing for maximum lava gloopiness").
// 0.55 in the new liquid (was 0.02): a lump warms as one almost at once.
export const defaultConduction = 0.55
export const defaultPace = 1
export const defaultTurbulence = 45
export const defaultDrifters = 2
export const defaultHeatSpots = 15
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
export const defaultWobbleKick = 6
export const defaultWobbleMax = 3.4
// Edge smoothing: radius in px of the blur on the density field before the metaball threshold,
// which rounds off the bumps of the individual particles along every edge. 0 is the lamp as
// drawn before it existed; WebGL only.
// Relaxation passes per frame. 1 is the lamp as tuned; 2 evens the particle spacing so the
// outline is less bumpy, for most of a step's time again.
export const defaultSettle = 1
// Viscosity: how much of the approach between neighbouring particles is taken away per second
// (the paper's sigma). Needs Wobble above 0 to do anything. 0 is the lamp as tuned.
export const defaultViscosity = 32
// The most a relaxation step may move a particle, in radii (the check that keeps a high Density
// from flying apart); which particles count as skin and take the kick, as a fraction of the mean
// density (300: all of them, the paper's own velocity); and the margin from a side wall within
// which lava is eased off it, px.
export const defaultReach = 1
export const defaultSkin = 300
export const defaultWall = 0
// The heater's elements against the new liquid (Robert: "the launching strips are back without
// the reservoirs, that was never a fix for the fluid behavior"): a lit element's heat per step at
// its core and how long a lighting burns, the tops of their ranges. The lab's finger, which
// pinches cleanly, is 48 per step for 3.4 s over 45 px; the elements were 3 to 8 for 5 to 15 s.
export const defaultElementHeat = 8
export const defaultElementLife = 15
// These three follow the window, so they are state too. The app updates them on resize.
export const defaultParticleCount = fnstate(computeDefaultParticleCount(window.innerWidth, window.innerHeight))
export const defaultInteractionRadius = fnstate(computeDefaultInteractionRadius(window.innerWidth, window.innerHeight))
export const defaultParticleSize = fnstate(computeDefaultParticleSize(window.innerWidth, window.innerHeight))
export const defaultSmooth = fnstate(computeDefaultSmooth(window.innerWidth, window.innerHeight))
export const defaultMaxTemp = fnstate(computeDefaultMaxTemp(window.innerHeight))
export const defaultGravityStrength = fnstate(computeDefaultGravity(window.innerHeight))

export const bgColor = fnstate({ ...defaultBgColor })
export const lavaColor = fnstate({ ...defaultLavaColor })
export const highlightColor = fnstate({ ...defaultLavaHighlight })
export const heatCold = fnstate({ ...defaultHeatColors.heatCold })
export const heatCool = fnstate({ ...defaultHeatColors.heatCool })
export const heatWarm = fnstate({ ...defaultHeatColors.heatWarm })
export const heatHot = fnstate({ ...defaultHeatColors.heatHot })
export const heatPeak = fnstate({ ...defaultHeatColors.heatPeak })
export const flowSlow = fnstate({ ...defaultFlowSlow })
export const flowFast = fnstate({ ...defaultFlowFast })
export const interactionRadius = fnstate(defaultInteractionRadius())
export const gravityStrength = fnstate(defaultGravityStrength())
export const stiffness = fnstate(defaultStiffness)
export const stiffnessNear = fnstate(defaultStiffnessNear)
export const restDensity = fnstate(defaultRestDensity)
export const maxTemp = fnstate(defaultMaxTemp())
export const particleCount = fnstate(defaultParticleCount())
export const particleSize = fnstate(defaultParticleSize())
export const stir = fnstate(defaultStir)
export const conduction = fnstate(defaultConduction)
export const pace = fnstate(defaultPace)
export const turbulence = fnstate(defaultTurbulence)
export const drifters = fnstate(defaultDrifters)
export const heatSpots = fnstate(defaultHeatSpots)
export const cupDepth = fnstate(defaultCupDepth)
export const wobble = fnstate(defaultWobble)
export const wobbleKick = fnstate(defaultWobbleKick)
export const wobbleMax = fnstate(defaultWobbleMax)
export const smooth = fnstate(defaultSmooth())
export const settle = fnstate(defaultSettle)
export const viscosity = fnstate(defaultViscosity)
export const reach = fnstate(defaultReach)
export const skin = fnstate(defaultSkin)
export const wall = fnstate(defaultWall)
export const elementHeat = fnstate(defaultElementHeat)
export const elementLife = fnstate(defaultElementLife)
// The random seed: every random number in the lamp comes from it, so the same seed on the same
// window gives the same lamp. Drawn fresh on each load unless saved, shared or given as ?seed=.
// Shown in the panel so a lamp worth keeping can be saved. Changing it reloads the page, since
// the layout and the first lightings are already drawn by then.
export const randomSeed = () => Math.floor(Math.random() * 1e9)
export const seed = fnstate(randomSeed())
// Draw the stirring as arrows over the lamp. Not saved or shared; it is a way of looking, not a look.
export const showFlow = fnstate(false)
export const showHeat = fnstate(true)
// Draw the heater strip and the heating elements along the floor, in either view. Not saved.
export const showHeater = fnstate(false)
// Pull the whole lamp into frame, hidden cups and all, scaled down, with the cup outlines drawn.
// Not saved. Robert: "add a toggle to move the cups into the frame so I can observe their behavior".
export const showCups = fnstate(false)
// What a finger on the lamp does. Not saved.
export const touchModes = ['push', 'pull', 'spin', 'heat', 'cool']
export const touchMode = fnstate('push')

// These keys are the saved and shared JSON format, so they must not change.
const colorSettings = { bgColor, lavaColor, lavaHighlight: highlightColor, heatCold, heatCool, heatWarm, heatHot, heatPeak, flowSlow, flowFast }
const numberSettings = { interactionRadius, gravityStrength, stiffness, stiffnessNear, restDensity, maxTemp, particleCount, particleSize, stir, conduction, pace, turbulence, drifters, heatSpots, cupDepth, wobble, wobbleKick, wobbleMax, smooth, settle, viscosity, reach, skin, wall, elementHeat, elementLife, seed }
// Settings that may be zero or negative. Everything else has to be positive to make sense.
const signedSettings = new Set(['stir', 'conduction', 'turbulence', 'drifters', 'heatSpots', 'cupDepth', 'wobble', 'smooth', 'wall'])

const defaults = () => ({
  bgColor: { ...defaultBgColor },
  lavaColor: { ...defaultLavaColor },
  lavaHighlight: { ...defaultLavaHighlight },
  heatCold: { ...defaultHeatColors.heatCold },
  heatCool: { ...defaultHeatColors.heatCool },
  heatWarm: { ...defaultHeatColors.heatWarm },
  heatHot: { ...defaultHeatColors.heatHot },
  heatPeak: { ...defaultHeatColors.heatPeak },
  flowSlow: { ...defaultFlowSlow },
  flowFast: { ...defaultFlowFast },
  interactionRadius: defaultInteractionRadius(),
  gravityStrength: defaultGravityStrength(),
  stiffness: defaultStiffness,
  stiffnessNear: defaultStiffnessNear,
  restDensity: defaultRestDensity,
  maxTemp: defaultMaxTemp(),
  particleCount: defaultParticleCount(),
  particleSize: defaultParticleSize(),
  stir: defaultStir,
  conduction: defaultConduction,
  pace: defaultPace,
  turbulence: defaultTurbulence,
  drifters: defaultDrifters,
  heatSpots: defaultHeatSpots,
  cupDepth: defaultCupDepth,
  wobble: defaultWobble,
  wobbleKick: defaultWobbleKick,
  wobbleMax: defaultWobbleMax,
  smooth: defaultSmooth(),
  settle: defaultSettle,
  viscosity: defaultViscosity,
  reach: defaultReach,
  skin: defaultSkin,
  wall: defaultWall,
  elementHeat: defaultElementHeat,
  elementLife: defaultElementLife,
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
  for (const [key, state] of Object.entries(colorSettings)) {
    if (saved[key]) state({ ...saved[key] })
  }
  for (const [key, state] of Object.entries(numberSettings)) {
    const value = Number(saved[key])
    if (Number.isFinite(value) && (value > 0 || signedSettings.has(key))) state(value)
  }
}

export const resetSettings = () => applySettings(defaults())

const STORAGE_KEY = 'lavalamp.app-settings'

// Saved settings first, then a share link on top if the URL has one.
export const loadSavedSettings = () => {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    try {
      applySettings(JSON.parse(saved))
    } catch {
      localStorage.removeItem(STORAGE_KEY)
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

export const saveSettings = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(getSettings()))

export const clearSavedSettings = () => localStorage.removeItem(STORAGE_KEY)

export const shareLink = () =>
  `${window.location.origin}${window.location.pathname}?shared=${btoa(JSON.stringify(getSettings()))}`
