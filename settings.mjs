import { button, div, input } from 'https://cdn.jsdelivr.net/npm/@srfnstack/fntags@0.3.8/src/fnelements.min.mjs'
import { fnstate } from 'https://cdn.jsdelivr.net/npm/@srfnstack/fntags@0.3.8/src/fntags.min.mjs'
import { formInput, hexToRgb, notify, rgbToHex } from './base.mjs'

export const defaultBgColor = { r: 25, g: 25, b: 25 }
export const defaultLavaColor = { r: 133, g: 0, b: 204 }
export const defaultLavaHighlight = { r: 182, g: 124, b: 254 }
export const defaultParticleCount = fnstate(Math.min(Math.trunc(window.innerHeight * window.innerWidth / 4000), 300))
export const defaultInteractionRadius = 60
export const defaultStiffness = 4000
export const defaultStiffnessNear = 25000
export const defaultRestDensity = 4.25
export const defaultParticleSize = 30
export const defaultMaxTemp = fnstate(Math.min(window.innerHeight, 1000))
export const defaultGravityStrength = fnstate(Math.min(window.innerHeight/2, 700))

export const bgColor = fnstate({ r: 0, g: 0, b: 0 })
export const lavaColor = fnstate({...defaultLavaColor})
export const highlightColor = fnstate({...defaultLavaHighlight})
export const interactionRadius = fnstate(defaultInteractionRadius)
export const gravityStrength = fnstate(defaultGravityStrength())
export const stiffness = fnstate(defaultStiffness)
export const stiffnessNear = fnstate(defaultStiffnessNear)
export const restDensity = fnstate(defaultRestDensity)
export const maxTemp = fnstate(defaultMaxTemp())
export const particleCount = fnstate(defaultParticleCount())
export const particleSize = fnstate(defaultParticleSize)
export let interactionRadiusSq = interactionRadius() * interactionRadius()

interactionRadius.subscribe(() => {
  interactionRadiusSq = interactionRadius() * interactionRadius()
})

const applySettings = obj => {
  bgColor(obj.bgColor || Object.assign({}, defaultBgColor))
  lavaColor(obj.lavaColor || Object.assign({}, defaultLavaColor))
  highlightColor(obj.lavaHighlight || Object.assign({}, defaultLavaHighlight))
  interactionRadius(obj.interactionRadius || interactionRadius())
  gravityStrength(obj.gravityStrength || gravityStrength())
  stiffness(obj.stiffness || stiffness())
  stiffnessNear(obj.stiffnessNear || stiffnessNear())
  restDensity(obj.restDensity || restDensity())
  maxTemp(obj.maxTemp || maxTemp())
  particleCount(obj.particleCount || particleCount())
  particleSize(obj.particleSize || particleSize())
}

const getSettings = () => ( {
  bgColor: bgColor(),
  lavaColor: lavaColor(),
  lavaHighlight: highlightColor(),
  interactionRadius: interactionRadius(),
  gravityStrength: gravityStrength(),
  stiffness: stiffness(),
  stiffnessNear: stiffnessNear(),
  restDensity: restDensity(),
  maxTemp: maxTemp(),
  particleCount: particleCount(),
  particleSize: particleSize(),
} )

let settingsKey = 'lavalamp.app-settings'
if (localStorage.getItem(settingsKey)) {
  applySettings(JSON.parse(localStorage.getItem(settingsKey)))
}

const urlParams = new URLSearchParams(window.location.search)
if (urlParams.get('shared')) {
  try {
    applySettings(JSON.parse(atob(urlParams.get('shared'))))
  } catch {
    notify('Invalid Share URL')
  }
}

const resetDefaults = () => {
  if (confirm('This will reset ALL defaults and remove saved settings')) {
    localStorage.removeItem(settingsKey)
    bgColor(Object.assign({}, defaultBgColor))
    lavaColor(Object.assign({}, defaultLavaColor))
    highlightColor(Object.assign({}, defaultLavaHighlight))
    interactionRadius(defaultInteractionRadius)
    gravityStrength(defaultGravityStrength())
    stiffness(defaultStiffness)
    stiffnessNear(defaultStiffnessNear)
    restDensity(defaultRestDensity)
    maxTemp(defaultMaxTemp())
    particleCount(defaultParticleCount())
    particleSize(defaultParticleSize)
  }
}

const copyShareLink = () =>
  navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?shared=${btoa(JSON.stringify(getSettings()))}`)
    .then(function () {
      notify('Link Copied to Clipboard')
    }, function (err) {
      notify('Failed to Copy Share Link...')
      console.error(err)
    })

export const resetToDefaultButton = (clickHandler, style) => div(
  {
    onclick: clickHandler,
    tooltip: 'Reset To Default',
    style: Object.assign({
      cursor: 'pointer',
      'margin-right': '-10px',
      'margin-left': '20px'
    }, style)
  },
  'x'
)


const saveSettings = () => {
  localStorage.setItem(
    settingsKey,
    JSON.stringify(getSettings())
  )
  settings.remove()
}

export const settings = div({
    style: {
      float: 'left',
      background: 'rgb(150,150,150,.6)',
      'z-index': 20,
      padding: '22px 22px',
      display: 'flex',
      position: 'relative',
      'max-width': '700px',
      'border-radius': '10px',
      'flex-direction': 'column',
      'justify-content': 'space-evenly',
      'align-items': 'center'
    }
  },
  formInput(
    'Background Color',
    input({
      id: 'bgColor',
      type: 'color',
      value: bgColor.bindAttr(() => rgbToHex(bgColor())),
      oninput: e => bgColor(hexToRgb(e.target.value))
    })
  ),
  formInput(
    'Lava Color',
    input({
      id: 'lavaColor',
      type: 'color',
      value: lavaColor.bindAttr(() => rgbToHex(lavaColor())),
      oninput: e => lavaColor(hexToRgb(e.target.value))
    })
  ),
  formInput(
    'Highlight Color',
    input({
      id: 'highlightColor',
      type: 'color',
      value: highlightColor.bindAttr(() => rgbToHex(highlightColor())),
      oninput: e => highlightColor(hexToRgb(e.target.value))
    })
  ),
  formInput(
    'Particle Size',
    input({
      id: 'particleSize',
      type: 'range',
      min: 5,
      step: 1,
      max: 50,
      value: particleSize.bindAttr(particleSize),
      oninput: (e) => particleSize(e.target.value)
    }),
    resetToDefaultButton(() => particleSize(defaultParticleSize))
  ),
  formInput(
    'Particle Count',
    input({
      id: 'particle-count',
      type: 'range',
      value: particleCount.bindAttr(),
      step: 1,
      min: 5,
      max: defaultParticleCount.bindAttr(() => Math.trunc(defaultParticleCount()) * 2),
      oninput: (e) => particleCount(parseInt(e.target.value))
    }),
    resetToDefaultButton(() => particleCount(defaultParticleCount))
  ),
  formInput(
    'Interaction Radius',
    input({
      id: 'interaction-radius',
      type: 'range',
      value: interactionRadius.bindAttr(),
      step: 1,
      min: 30,
      max: 100,
      oninput: (e) => interactionRadius(e.target.value)
    }),
    resetToDefaultButton(() => interactionRadius(defaultInteractionRadius))
  ),
  formInput(
    'Stiffness',
    input({
      id: 'stiffness',
      type: 'range',
      value: stiffness.bindAttr(),
      step: 1,
      min: 1,
      max: 6500,
      oninput: (e) => stiffness(e.target.value)
    }),
    resetToDefaultButton(() => stiffness(defaultStiffness))
  ),
  formInput(
    'Stiffness Near',
    input({
      id: 'stiffness-near',
      type: 'range',
      value: stiffnessNear.bindAttr(),
      step: 10,
      min: 1,
      max: 40000,
      oninput: (e) => stiffnessNear(e.target.value)
    }),
    resetToDefaultButton(() => stiffnessNear(defaultStiffnessNear))
  ),
  formInput(
    'Rest Density',
    input({
      id: 'rest-density',
      type: 'range',
      value: restDensity.bindAttr(),
      step: .01,
      min: .01,
      max: 7,
      oninput: (e) => restDensity(e.target.value)
    }),
    resetToDefaultButton(() => restDensity(defaultRestDensity))
  ),
  formInput(
    'Max Temp',
    input({
      id: 'max-temp',
      type: 'range',
      value: maxTemp.bindAttr(),
      step: 1,
      min: 420,
      max: defaultMaxTemp.bindAttr(() => defaultMaxTemp() * 2),
      oninput: (e) => maxTemp(e.target.value)
    }),
    resetToDefaultButton(() => maxTemp(defaultMaxTemp()))
  ),
  formInput(
    'Gravity Strength',
    input({
      id: 'gravity',
      type: 'range',
      value: gravityStrength.bindAttr(),
      step: 1,
      min: 220,
      max: defaultGravityStrength.bindAttr(() => defaultGravityStrength() * 2),
      oninput: (e) => gravityStrength(parseFloat(e.target.value))
    }),
    resetToDefaultButton(() => gravityStrength(defaultGravityStrength()))
  ),
  formInput(
    'Share',
    button({
      id: 'share', onclick: copyShareLink,
      style: {
        'border-radius': '5px',
        padding: '5px'
      }
    }, 'Share')
  ),
  formInput(
    'Save',
    button({
      id: 'save', onclick: saveSettings,
      style: {
        'border-radius': '5px',
        padding: '5px'
      }
    }, 'Save and Close')
  ),
  formInput('Reset Defaults', button({
    id: 'reset', onclick: resetDefaults,
    style: {
      'border-radius': '5px',
      padding: '5px'
    }
  }, 'Reset Defaults')),
  div({
      style: {
        position: 'absolute',
        top: '10px',
        right: '20px',
        'font-style': 'sans-serif',
        'font-size': '26px',
        cursor: 'pointer'
      },
      onclick: () => settings.remove()
    },
    'x'
  )
)
