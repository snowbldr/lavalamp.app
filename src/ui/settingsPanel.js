import { button, div, input } from '@srfnstack/fntags'
import { hexToRgb, rgbToHex } from '../color.js'
import { formInput, notify, resetToDefaultButton } from './components.js'
import {
  bgColor,
  clearSavedSettings,
  conduction,
  defaultConduction,
  defaultDrifters,
  defaultHeatSpots,
  defaultPace,
  defaultGravityStrength,
  defaultInteractionRadius,
  defaultMaxTemp,
  defaultParticleCount,
  defaultParticleSize,
  defaultRestDensity,
  defaultStiffness,
  defaultStiffnessNear,
  defaultStir,
  defaultTurbulence,
  drifters,
  gravityStrength,
  heatSpots,
  highlightColor,
  interactionRadius,
  lavaColor,
  maxTemp,
  particleCount,
  pace,
  particleSize,
  resetSettings,
  restDensity,
  saveSettings,
  shareLink,
  showFlow,
  showHeat,
  stiffness,
  stiffnessNear,
  stir,
  turbulence
} from './settings.js'

const colorPicker = (title, id, state) => formInput(
  title,
  input({
    id,
    type: 'color',
    value: state.bindAttr(() => rgbToHex(state())),
    oninput: e => state(hexToRgb(e.target.value))
  })
)

// `max` may be a number or a bound attribute, for sliders whose range follows the window size.
const slider = (title, id, state, { min, max, step }, resetTo) => formInput(
  title,
  input({
    id,
    type: 'range',
    min,
    max,
    step,
    value: state.bindAttr(),
    oninput: e => state(parseFloat(e.target.value))
  }),
  resetTo && resetToDefaultButton(() => state(resetTo()))
)

const actionButton = (title, id, text, onclick) => formInput(
  title,
  button({ id, onclick, style: { 'border-radius': '5px', padding: '5px' } }, text)
)

export function createSettingsPanel () {
  let panel

  const open = () => document.body.append(panel)
  const close = () => panel.remove()

  const copyShareLink = () =>
    navigator.clipboard.writeText(shareLink()).then(
      () => notify('Link Copied to Clipboard'),
      err => {
        notify('Failed to Copy Share Link...')
        console.error(err)
      }
    )

  const resetDefaults = () => {
    if (confirm('This will reset ALL defaults and remove saved settings')) {
      clearSavedSettings()
      resetSettings()
    }
  }

  panel = div(
    {
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
    colorPicker('Background Color', 'bgColor', bgColor),
    colorPicker('Lava Color', 'lavaColor', lavaColor),
    colorPicker('Highlight Color', 'highlightColor', highlightColor),
    slider('Particle Size', 'particleSize', particleSize, { min: 5, max: 50, step: 1 }, () => defaultParticleSize),
    slider('Particle Count', 'particle-count', particleCount, {
      min: 5,
      max: defaultParticleCount.bindAttr(() => Math.trunc(defaultParticleCount()) * 2),
      step: 1
    }, defaultParticleCount),
    slider('Interaction Radius', 'interaction-radius', interactionRadius, { min: 30, max: 100, step: 1 }, () => defaultInteractionRadius),
    slider('Stiffness', 'stiffness', stiffness, { min: 1, max: 6500, step: 1 }, () => defaultStiffness),
    slider('Stiffness Near', 'stiffness-near', stiffnessNear, { min: 1, max: 40000, step: 10 }, () => defaultStiffnessNear),
    slider('Rest Density', 'rest-density', restDensity, { min: 0.01, max: 7, step: 0.01 }, () => defaultRestDensity),
    slider('Max Temp', 'max-temp', maxTemp, {
      min: 420,
      max: defaultMaxTemp.bindAttr(() => defaultMaxTemp() * 2),
      step: 1
    }, defaultMaxTemp),
    slider('Gravity Strength', 'gravity', gravityStrength, {
      min: 220,
      max: defaultGravityStrength.bindAttr(() => defaultGravityStrength() * 2),
      step: 1
    }, defaultGravityStrength),
    slider('Stir', 'stir', stir, { min: -60, max: 60, step: 1 }, () => defaultStir),
    slider('Turbulence', 'turbulence', turbulence, { min: 0, max: 150, step: 1 }, () => defaultTurbulence),
    slider('Drifting Eddies', 'drifters', drifters, { min: 0, max: 6, step: 1 }, () => defaultDrifters),
    slider('Heat Spots', 'heat-spots', heatSpots, { min: 0, max: 60, step: 1 }, () => defaultHeatSpots),
    slider('Conduction', 'conduction', conduction, { min: 0, max: 0.02, step: 0.0005 }, () => defaultConduction),
    slider('Pace', 'pace', pace, { min: 0.1, max: 1, step: 0.05 }, () => defaultPace),
    actionButton('Flow Field', 'flow', showFlow.bindAs(() => showFlow() ? 'Hide Arrows' : 'Show Arrows'), () => showFlow(!showFlow())),
    actionButton('Heat Map', 'heat', showHeat.bindAs(() => showHeat() ? 'Hide Heat' : 'Show Heat'), () => showHeat(!showHeat())),
    actionButton('Share', 'share', 'Share', copyShareLink),
    actionButton('Save', 'save', 'Save and Close', () => {
      saveSettings()
      close()
    }),
    actionButton('Reset Defaults', 'reset', 'Reset Defaults', resetDefaults),
    div(
      {
        style: {
          position: 'absolute',
          top: '10px',
          right: '20px',
          'font-size': '26px',
          cursor: 'pointer'
        },
        onclick: close
      },
      'x'
    )
  )

  return { element: panel, open, close }
}
