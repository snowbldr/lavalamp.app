import { fnstate } from '@srfnstack/fntags'
import { notify } from './components.js'

// Defaults that depend on the window. They take the raw window size, not the capped lamp size,
// because that is what the lamp was tuned against.
// One particle per 3000 square px of window, at most 1500. It was one per 4000 and at most 1000
// while the 2D canvas renderer spent most of the frame reading pixels back; with the metaball pass
// on the GPU the step is the only cost that grows with lava (1.1 ms at 1000 particles, 1.9 at 1500,
// on Robert's Mac), and Robert asked for "a bit more lava by default after we improve the
// performance". The cap used to be 300, from when the lamp itself stopped at 1000 px square.
export const computeDefaultParticleCount = (width, height) => Math.min(Math.trunc(width * height / 3000), 1500)
// Max temp was min(height, 1000) with the slider running to twice that. With heating in depth and
// conduction at 0.02 Robert had to run it at the top to get blobs at all ("I think I need to make
// max temp the new mid same way as conduction"): with heating in depth a cap at the window height
// held the lava back. The old top is the new default.
export const computeDefaultMaxTemp = height => Math.min(height * 2, 2000)
export const computeDefaultGravity = height => Math.min(height / 2, 700)

export const defaultBgColor = { r: 0, g: 0, b: 0 }
export const defaultLavaColor = { r: 133, g: 0, b: 204 }
export const defaultLavaHighlight = { r: 182, g: 124, b: 254 }
// The heat map's gradient, cold (sinking) to peak (hottest), and the flow field's, slow to fast.
// Robert: "the colors are now confusing with heat map as the default... Maybe we should show two
// different versions of color. One for heatmap to pick the gradient and one for no heat map to
// pick the static colors. the color would auto switch based on the heat map setting. could we
// also color the flow field with a gradient as well?"
export const defaultHeatColors = {
  heatCold: { r: 20, g: 0, b: 60 },
  heatCool: { r: 110, g: 0, b: 170 },
  heatWarm: { r: 220, g: 40, b: 40 },
  heatHot: { r: 255, g: 170, b: 0 },
  heatPeak: { r: 255, g: 255, b: 230 }
}
export const defaultFlowSlow = { r: 70, g: 110, b: 255 }
export const defaultFlowFast = { r: 255, g: 255, b: 255 }
export const defaultInteractionRadius = 60
export const defaultStiffness = 4000
export const defaultStiffnessNear = 25000
export const defaultRestDensity = 4.25
export const defaultParticleSize = 30
// Peak speed of the convection roll that stirs the lava, in pixels per second. 0 turns it off.
export const defaultStir = 20
// Conduction was 0.005 with a flat floor, where 0.02 was the top of the slider and a lamp that never
// lifted. With heating in depth the top became the lamp Robert wanted ("max needs to be the new mid
// and default. This is the mechanism we were missing for maximum lava gloopiness").
export const defaultConduction = 0.02
export const defaultPace = 0.7
export const defaultTurbulence = 45
export const defaultDrifters = 2
export const defaultHeatSpots = 15
// How deep the ceiling cups are, as a fraction of each cup's width. 0 is a flat ceiling.
export const defaultCupDepth = 1
// These three follow the window, so they are state too. The app updates them on resize.
export const defaultParticleCount = fnstate(computeDefaultParticleCount(window.innerWidth, window.innerHeight))
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
export const interactionRadius = fnstate(defaultInteractionRadius)
export const gravityStrength = fnstate(defaultGravityStrength())
export const stiffness = fnstate(defaultStiffness)
export const stiffnessNear = fnstate(defaultStiffnessNear)
export const restDensity = fnstate(defaultRestDensity)
export const maxTemp = fnstate(defaultMaxTemp())
export const particleCount = fnstate(defaultParticleCount())
export const particleSize = fnstate(defaultParticleSize)
export const stir = fnstate(defaultStir)
export const conduction = fnstate(defaultConduction)
export const pace = fnstate(defaultPace)
export const turbulence = fnstate(defaultTurbulence)
export const drifters = fnstate(defaultDrifters)
export const heatSpots = fnstate(defaultHeatSpots)
export const cupDepth = fnstate(defaultCupDepth)
// Draw the stirring as arrows over the lamp. Not saved or shared; it is a way of looking, not a look.
export const showFlow = fnstate(false)
export const showHeat = fnstate(true)
// Draw the heater strip and the heating elements along the floor, in either view. Not saved.
export const showHeater = fnstate(false)
// What a finger on the lamp does. Not saved.
export const touchModes = ['push', 'pull', 'spin', 'heat', 'cool']
export const touchMode = fnstate('push')

// These keys are the saved and shared JSON format, so they must not change.
const colorSettings = { bgColor, lavaColor, lavaHighlight: highlightColor, heatCold, heatCool, heatWarm, heatHot, heatPeak, flowSlow, flowFast }
const numberSettings = { interactionRadius, gravityStrength, stiffness, stiffnessNear, restDensity, maxTemp, particleCount, particleSize, stir, conduction, pace, turbulence, drifters, heatSpots, cupDepth }
// Settings that may be zero or negative. Everything else has to be positive to make sense.
const signedSettings = new Set(['stir', 'conduction', 'turbulence', 'drifters', 'heatSpots', 'cupDepth'])

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
  interactionRadius: defaultInteractionRadius,
  gravityStrength: defaultGravityStrength(),
  stiffness: defaultStiffness,
  stiffnessNear: defaultStiffnessNear,
  restDensity: defaultRestDensity,
  maxTemp: defaultMaxTemp(),
  particleCount: defaultParticleCount(),
  particleSize: defaultParticleSize,
  stir: defaultStir,
  conduction: defaultConduction,
  pace: defaultPace,
  turbulence: defaultTurbulence,
  drifters: defaultDrifters,
  heatSpots: defaultHeatSpots,
  cupDepth: defaultCupDepth
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
  const shared = new URLSearchParams(window.location.search).get('shared')
  if (shared) {
    try {
      applySettings(JSON.parse(atob(shared)))
    } catch {
      notify('Invalid Share URL')
    }
  }
}

export const saveSettings = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(getSettings()))

export const clearSavedSettings = () => localStorage.removeItem(STORAGE_KEY)

export const shareLink = () =>
  `${window.location.origin}${window.location.pathname}?shared=${btoa(JSON.stringify(getSettings()))}`
