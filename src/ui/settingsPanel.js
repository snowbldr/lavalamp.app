import { button, div, fnstate, span } from '@srfnstack/fntags'
import { knob, knobs, notify, row, section, segmented, swatch, swatchRow, toggle } from './components.js'
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
  flowFast,
  flowSlow,
  gravityStrength,
  heatCold,
  heatCool,
  heatHot,
  heatPeak,
  heatSpots,
  heatWarm,
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
  showHeater,
  touchMode,
  touchModes,
  stiffness,
  stiffnessNear,
  stir,
  turbulence
} from './settings.js'

// Two sections: Lamp, for anyone (colours, how often it heats, how gloopy, how fast, what a
// finger does, how to look at it), and Physics, folded away, for the particle model. The knob
// labels are short because four knobs share a row; Gloop is the Conduction setting, named for
// what Robert said it does ("the mechanism we were missing for maximum lava gloopiness").
const seconds = v => `${v} s`
const whole = v => String(Math.round(v))
const fixed = digits => v => Number(v).toFixed(digits)
const times = v => `${Number(v).toFixed(2)}x`

export function createSettingsPanel () {
  let panel
  const physicsOpen = fnstate(false)
  const lampOpen = fnstate(true)

  const open = () => document.body.append(panel)
  const close = () => panel.remove()

  const copyShareLink = () =>
    navigator.clipboard.writeText(shareLink()).then(
      () => notify('Link copied to clipboard'),
      err => {
        notify('Failed to copy share link')
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
    { class: 'panel', onclick: e => e.stopPropagation() },
    div(
      { class: 'panel-header' },
      span({ class: 'panel-title' }, 'lavalamp.app'),
      button({ class: 'panel-close', onclick: close, title: 'Close' }, '×')
    ),
    section(
      'Lamp', lampOpen,
      // The colour rows follow the views: the heat gradient while the heat map is on, the lava
      // colours while it is off, and the flow gradient while the arrows are on.
      swatchRow('Heat colours', showHeat, true,
        swatch('Cold', 'heatCold', heatCold),
        swatch('Cool', 'heatCool', heatCool),
        swatch('Warm', 'heatWarm', heatWarm),
        swatch('Hot', 'heatHot', heatHot),
        swatch('Peak', 'heatPeak', heatPeak),
        swatch('Back', 'bgColor', bgColor)
      ),
      swatchRow('Lava colours', showHeat, false,
        swatch('Lava', 'lavaColor', lavaColor),
        swatch('Glow', 'highlightColor', highlightColor),
        swatch('Back', 'bgColor2', bgColor)
      ),
      swatchRow('Flow colours', showFlow, true,
        swatch('Slow', 'flowSlow', flowSlow),
        swatch('Fast', 'flowFast', flowFast)
      ),
      knobs(
        knob('Heat', 'heat-spots', heatSpots, { min: 0, max: 60, step: 1 }, () => defaultHeatSpots, seconds),
        knob('Gloop', 'conduction', conduction, { min: 0, max: 0.04, step: 0.0005 }, () => defaultConduction, fixed(4)),
        knob('Stir', 'stir', stir, { min: -60, max: 60, step: 1 }, () => defaultStir),
        knob('Pace', 'pace', pace, { min: 0.1, max: 1, step: 0.05 }, () => defaultPace, times)
      ),
      row('Touch', segmented('touch', touchMode, touchModes)),
      row('Heat Map', toggle('heat', showHeat)),
      row('Flow Field', toggle('flow', showFlow)),
      row('Heater', toggle('heater', showHeater))
    ),
    section(
      'Physics', physicsOpen,
      knobs(
        knob('Size', 'particleSize', particleSize, { min: 5, max: 50, step: 1 }, () => defaultParticleSize),
        knob('Count', 'particle-count', particleCount, { min: 5, max: () => Math.trunc(defaultParticleCount()) * 2, step: 1 }, defaultParticleCount, whole),
        knob('Radius', 'interaction-radius', interactionRadius, { min: 30, max: 100, step: 1 }, () => defaultInteractionRadius),
        knob('Stiff', 'stiffness', stiffness, { min: 1, max: 6500, step: 1 }, () => defaultStiffness),
        knob('Near', 'stiffness-near', stiffnessNear, { min: 1, max: 40000, step: 10 }, () => defaultStiffnessNear),
        knob('Density', 'rest-density', restDensity, { min: 0.01, max: 7, step: 0.01 }, () => defaultRestDensity, fixed(2)),
        knob('Max Temp', 'max-temp', maxTemp, { min: 420, max: () => defaultMaxTemp() * 2, step: 1 }, defaultMaxTemp, whole),
        knob('Gravity', 'gravity', gravityStrength, { min: 220, max: () => defaultGravityStrength() * 2, step: 1 }, defaultGravityStrength, whole),
        knob('Turb', 'turbulence', turbulence, { min: 0, max: 150, step: 1 }, () => defaultTurbulence),
        knob('Eddies', 'drifters', drifters, { min: 0, max: 6, step: 1 }, () => defaultDrifters)
      )
    ),
    div(
      { class: 'actions' },
      button({ id: 'share', onclick: copyShareLink }, 'Share'),
      button({ id: 'reset', onclick: resetDefaults }, 'Reset'),
      button({
        id: 'save',
        class: 'primary',
        onclick: () => {
          saveSettings()
          close()
          notify('Settings saved')
        }
      }, 'Save')
    )
  )

  return { element: panel, open, close }
}
