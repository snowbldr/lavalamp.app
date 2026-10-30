import { fnstate } from '@srfnstack/fntags'
import { notify } from './components.js'

// Defaults that depend on the window. They take the raw window size, not the capped lamp size,
// because that is what the lamp was tuned against.
export const computeDefaultParticleCount = (width, height) => Math.min(Math.trunc(width * height / 4000), 300)
export const computeDefaultMaxTemp = height => Math.min(height, 1000)
export const computeDefaultGravity = height => Math.min(height / 2, 700)

export const defaultBgColor = { r: 0, g: 0, b: 0 }
export const defaultLavaColor = { r: 133, g: 0, b: 204 }
export const defaultLavaHighlight = { r: 182, g: 124, b: 254 }
export const defaultInteractionRadius = 60
export const defaultStiffness = 4000
export const defaultStiffnessNear = 25000
export const defaultRestDensity = 4.25
export const defaultParticleSize = 30
// These three follow the window, so they are state too. The app updates them on resize.
export const defaultParticleCount = fnstate(computeDefaultParticleCount(window.innerWidth, window.innerHeight))
export const defaultMaxTemp = fnstate(computeDefaultMaxTemp(window.innerHeight))
export const defaultGravityStrength = fnstate(computeDefaultGravity(window.innerHeight))

export const bgColor = fnstate({ ...defaultBgColor })
export const lavaColor = fnstate({ ...defaultLavaColor })
export const highlightColor = fnstate({ ...defaultLavaHighlight })
export const interactionRadius = fnstate(defaultInteractionRadius)
export const gravityStrength = fnstate(defaultGravityStrength())
export const stiffness = fnstate(defaultStiffness)
export const stiffnessNear = fnstate(defaultStiffnessNear)
export const restDensity = fnstate(defaultRestDensity)
export const maxTemp = fnstate(defaultMaxTemp())
export const particleCount = fnstate(defaultParticleCount())
export const particleSize = fnstate(defaultParticleSize)

// These keys are the saved and shared JSON format, so they must not change.
const colorSettings = { bgColor, lavaColor, lavaHighlight: highlightColor }
const numberSettings = { interactionRadius, gravityStrength, stiffness, stiffnessNear, restDensity, maxTemp, particleCount, particleSize }

const defaults = () => ({
  bgColor: { ...defaultBgColor },
  lavaColor: { ...defaultLavaColor },
  lavaHighlight: { ...defaultLavaHighlight },
  interactionRadius: defaultInteractionRadius,
  gravityStrength: defaultGravityStrength(),
  stiffness: defaultStiffness,
  stiffnessNear: defaultStiffnessNear,
  restDensity: defaultRestDensity,
  maxTemp: defaultMaxTemp(),
  particleCount: defaultParticleCount(),
  particleSize: defaultParticleSize
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
    if (Number.isFinite(value) && value > 0) state(value)
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
