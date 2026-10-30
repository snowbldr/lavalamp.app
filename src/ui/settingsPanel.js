import { button, div, fnstate } from '@srfnstack/fntags'
import { hint, knob, knobs, notify, row, section, segmented, swatch, swatchRow, toggle } from './components.js'
import {
  bgColor,
  clearSavedSettings,
  conduction,
  cupDepth,
  defaultConduction,
  defaultCupDepth,
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
  const help = fnstate(false) // the ? button: one sentence under every control

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
    // No title bar (Robert: "remove the lavalamp.app from the panel tons of wasted space"); the
    // close button sits in the corner over the Lamp heading. Lamp does not fold ("lamp controls
    // do not need to be collapsible, just physics is good"); Physics does, closed by default.
    button({ class: 'panel-close', onclick: close, title: 'Close' }, '×'),
    button({ class: help.bindAttr(() => help() ? 'panel-close panel-help on' : 'panel-close panel-help'), onclick: () => help(!help()), title: 'What the controls do' }, '?'),
    section(
      'Lamp', null,
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
      hint(help, 'The colours follow the view: the heat map gradient from coldest, sinking lava to hottest while the heat map is on, the lava and its lit underside while it is off, and the slowest to fastest arrow while the flow field is on.'),
      knobs(
        knob('Heat', 'heat-spots', heatSpots, { min: 0, max: 60, step: 1 }, () => defaultHeatSpots, seconds),
        knob('Gloop', 'conduction', conduction, { min: 0, max: 0.04, step: 0.0005 }, () => defaultConduction, fixed(4)),
        knob('Stir', 'stir', stir, { min: -60, max: 60, step: 1 }, () => defaultStir),
        knob('Pace', 'pace', pace, { min: 0.1, max: 1, step: 0.05 }, () => defaultPace, times)
      ),
      hint(help, [
        ['Heat', 'Seconds between heating elements lighting under the lava; 0 keeps the whole floor warm instead.'],
        ['Gloop', 'How fast heat spreads between touching lava, so a blob warms and lifts as one; higher is gloopier.'],
        ['Stir', 'Speed of the slow convection roll, up the middle and down the walls; negative runs it backwards.'],
        ['Pace', 'Slow motion for the whole lamp.']
      ]),
      row('Touch', segmented('touch', touchMode, touchModes)),
      hint(help, 'What a finger or the mouse does to the lava under it: shove it away, gather it in, spin it, heat it or cool it.'),
      row('Heat Map', toggle('heat', showHeat)),
      hint(help, 'Colour the lava by its temperature instead of the lava colour.'),
      row('Flow Field', toggle('flow', showFlow)),
      hint(help, 'Draw the stirring as arrows, like wind on a weather map.'),
      row('Heater', toggle('heater', showHeater)),
      hint(help, 'Show the heater strip and its elements along the floor.')
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
        knob('Eddies', 'drifters', drifters, { min: 0, max: 6, step: 1 }, () => defaultDrifters),
        knob('Cups', 'cup-depth', cupDepth, { min: 0, max: 2, step: 0.05 }, () => defaultCupDepth, fixed(2))
      ),
      hint(help, [
        ['Size', 'Radius of each drawn particle, so how fat the lava looks.'],
        ['Count', 'How many particles make up the lava.'],
        ['Radius', 'How far apart two particles can be and still feel each other.'],
        ['Stiff', 'How hard particles push apart when crowded and pull together when sparse.'],
        ['Near', 'An extra push at very close range that stops particles stacking.'],
        ['Density', 'The crowding the lava settles at; lower puffs it up, higher packs it.'],
        ['Max Temp', 'The hottest a particle can get, which is also the fastest it can rise.'],
        ['Gravity', 'How fast cold lava sinks; a particle at this temperature hovers.'],
        ['Turb', 'How often a random eddy appears and stirs one spot for a few seconds.'],
        ['Eddies', 'How many drifting tornado eddies wander the lamp at once.'],
        ['Cups', 'How deep the cups in the ceiling are, as a fraction of their width; 0 is a flat ceiling.']
      ])
    ),
    hint(help, 'Share copies a link that carries these settings, Reset restores every default, Save keeps them in this browser.'),
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
