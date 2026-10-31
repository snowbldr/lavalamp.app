import { button, div, fnstate, input, span } from '@srfnstack/fntags'
import { hint, knob, knobs, notify, pair, row, section, segmented, swatch, swatchRow, toggle } from './components.js'
import {
  bgColor,
  conduction,
  cupDepth,
  defaultConduction,
  defaultCupDepth,
  defaultWobble,
  defaultSmooth,
  smooth,
  defaultBlend,
  blend,
  defaultSettle,
  defaultViscosity,
  defaultWobbleKick,
  defaultWobbleMax,
  defaultReach,
  defaultSkin,
  defaultWall,
  defaultElementHeat,
  defaultElementLife,
  defaultElementRate,
  defaultElementLifeScale,
  defaultElementCore,
  defaultFloorHeat,
  defaultFloorGlow,
  elementHeat,
  elementLife,
  elementRate,
  elementLifeScale,
  elementCore,
  floorHeat,
  floorGlow,
  settle,
  viscosity,
  wobbleKick,
  wobbleMax,
  reach,
  skin,
  wall,
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
  interactionRadius,
  maxTemp,
  particleCount,
  pace,
  particleSize,
  randomSeed,
  reloadWithSeed,
  resetAndReload,
  seed,
  restDensity,
  saveSettings,
  shareLink,
  showFlow,
  showCups,
  sound,
  themes,
  applyTheme,
  gradientKinds,
  gradientKind,
  gradientFrom,
  gradientTo,
  gradientHue,
  soundPending,
  fullscreen,
  soundBed,
  soundBeds,
  showHeater,
  touchMode,
  touchModes,
  stiffness,
  stiffnessNear,
  stir,
  turbulence,
  wobble
} from './settings.js'

// Two sections: Lamp, for anyone (colours, how often it heats, how gloopy, how fast, what a
// finger does, how to look at it), and Physics, folded away, for the particle model. The knob
// labels are short because four knobs share a row; Gloop is the Conduction setting, named for
// what Robert said it does ("the mechanism we were missing for maximum lava gloopiness").
const seconds = v => `${v} s`
const whole = v => String(Math.round(v))
const fixed = digits => v => Number(v).toFixed(digits)
const always = fnstate(true)
const isPresets = fnstate(true)
const isTwoTone = fnstate(false)
const isLuminance = fnstate(false)
gradientKind.subscribe(kind => { isPresets(kind === 'presets'); isTwoTone(kind === 'duotone'); isLuminance(kind === 'mono') })
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
    if (confirm('This will reset ALL defaults and remove saved settings')) resetAndReload()
  }

  // The seed: typed in and applied on Enter or when the field loses focus, or drawn afresh with
  // New; either way the page reloads so everything random comes from it.
  const applySeed = e => {
    const value = Math.floor(Number(e.target.value))
    if (Number.isFinite(value) && value >= 0 && value !== seed()) reloadWithSeed(value)
    else e.target.value = String(seed())
  }
  const seedField = input({
    id: 'seed',
    class: 'seed',
    type: 'text',
    inputmode: 'numeric',
    value: seed.bindAttr(() => String(seed())),
    onchange: applySeed,
    onkeydown: e => { if (e.key === 'Enter') e.target.blur() }
  })

  panel = div(
    { class: 'panel', onclick: e => e.stopPropagation() },
    // No title bar (Robert: "remove the lavalamp.app from the panel tons of wasted space"); the
    // buttons sit in the corner beside the first colour row's caption. The lamp controls have no
    // heading and do not fold ("Remove the word lamp"; "lamp controls do not need to be
    // collapsible, just physics is good"); Physics does, closed by default.
    button({ class: 'panel-close', onclick: close, title: 'Close' }, '×'),
    button({ class: help.bindAttr(() => help() ? 'panel-close panel-help on' : 'panel-close panel-help'), onclick: () => help(!help()), title: 'What the controls do' }, '?'),
    section(
      null, null,
      // The colour rows follow the views: the heat gradient while the heat map is on, the lava
      // colours while it is off, and the flow gradient while the arrows are on.
      swatchRow('Heat colours', always, true,
        swatch('Cold', 'heatCold', heatCold),
        swatch('Cool', 'heatCool', heatCool),
        swatch('Warm', 'heatWarm', heatWarm),
        swatch('Hot', 'heatHot', heatHot),
        swatch('Peak', 'heatPeak', heatPeak),
        swatch('Back', 'bgColor', bgColor)
      ),
      swatchRow('Flow colours', showFlow, true,
        swatch('Slow', 'flowSlow', flowSlow),
        swatch('Fast', 'flowFast', flowFast)
      ),
      row('Gradient', segmented('gradient', gradientKind, gradientKinds)),
      swatchRow('Duotone', isTwoTone, true,
        swatch('From', 'gradientFrom', gradientFrom),
        swatch('To', 'gradientTo', gradientTo)
      ),
      swatchRow('Mono', isLuminance, true,
        swatch('Colour', 'gradientHue', gradientHue)
      ),
      div({ class: 'swatch-row', style: { display: isPresets.bindStyle(() => isPresets() ? 'block' : 'none') } },
        div({ class: 'swatch-caption' }, 'Themes'),
        div({ class: 'themes' }, ...themes.map(theme => button({
          class: 'theme',
          title: theme.name,
          style: { background: `linear-gradient(90deg, ${['heatCold', 'heatCool', 'heatWarm', 'heatHot', 'heatPeak'].map(k => `rgb(${theme[k].r},${theme[k].g},${theme[k].b})`).join(', ')})` },
          onclick: () => applyTheme(theme)
        }, span(theme.name))))
      ),
      hint(help, 'The lava is coloured by its heat, coldest and sinking to hottest. Presets are six gradients that jump hue; Duotone runs from one colour to another; Mono runs one colour from dark to light. The swatches above still change any single stop, and the flow colours are the slowest to fastest arrow.'),
      knobs(
        knob('Heat', 'heat-spots', heatSpots, { min: 0, max: 60, step: 1 }, () => defaultHeatSpots, seconds),
        knob('Conduct', 'conduction', conduction, { min: 0, max: 1, step: 0.01 }, () => defaultConduction, fixed(2)),
        knob('Stir', 'stir', stir, { min: -60, max: 60, step: 1 }, () => defaultStir),
        knob('Pace', 'pace', pace, { min: 0.1, max: 1, step: 0.05 }, () => defaultPace, times)
      ),
      hint(help, [
        ['Heat', 'Seconds between heating elements lighting under the lava; 0 keeps the whole floor warm instead.'],
        ['Conduct', 'How fast heat spreads between touching lava. High and a blob warms and lifts as one; too high and a rising blob heats the pool below it through its neck and feeds the stretch.'],
        ['Stir', 'Speed of the slow convection roll, up the middle and down the walls; negative runs it backwards.'],
        ['Pace', 'Slow motion for the whole lamp.']
      ]),
      row('Touch', segmented('touch', touchMode, touchModes)),
      hint(help, 'What a finger or the mouse does to the lava under it: shove it away, gather it in, spin it, heat it or cool it.'),
      pair('Flow Field', toggle('flow', showFlow), 'Heater', toggle('heater', showHeater)),
      hint(help, [
        ['Flow Field', 'Draw the stirring as arrows, like wind on a weather map.']
      ]),
      pair('Reservoirs', toggle('cups', showCups), 'Sound', div({ class: soundPending.bindAttr(() => soundPending() ? 'pending' : '') }, toggle('sound', sound))),
      row('Bed', segmented('bed', soundBed, soundBeds)),
      hint(help, 'Gloops made up from the lava as it moves: a bloop where a neck snaps or a blob lands, pitched by how much lava moved, and a bed that follows how stirred up the lava is: Simmer is a scatter of tiny pops, Noise a low rumble, Hum a drone.'),
      hint(help, [
        ['Heater', 'Show the heater strip and its elements along the floor.'],
        ['Reservoirs', 'Pull the whole lamp into frame, the hidden bottles above and pots below and all, so you can watch the lava in them; with Heater on, the pots light up as their heaters do.']
      ]),
      pair('Fullscreen', toggle('fullscreen', fullscreen)),
      hint(help, 'The lamp over the whole screen with nothing around it. Esc brings the browser back.'),
      row('Seed', div({ class: 'seed-row' }, seedField, button({ class: 'small', onclick: () => reloadWithSeed(randomSeed()), title: 'A fresh random seed' }, 'New'))),
      hint(help, 'The random seed behind this lamp: the same seed on the same window gives the same cups, elements and eddies. Type one or press New; either reloads. Save keeps it.')
    ),
    section(
      'Physics', physicsOpen,
      knobs(
        knob('Size', 'particleSize', particleSize, { min: 1, max: 50, step: 1 }, () => defaultParticleSize()),
        knob('Count', 'particle-count', particleCount, { min: 5, max: () => Math.trunc(defaultParticleCount()) * 2, step: 1 }, defaultParticleCount, whole),
        knob('Radius', 'interaction-radius', interactionRadius, { min: 5, max: 100, step: 1 }, () => defaultInteractionRadius()),
        knob('Stiff', 'stiffness', stiffness, { min: 1, max: 6500, step: 1 }, () => defaultStiffness()),
        knob('Near', 'stiffness-near', stiffnessNear, { min: 1, max: 40000, step: 10 }, () => defaultStiffnessNear()),
        knob('Density', 'rest-density', restDensity, { min: 0.1, max: 1000, step: 0.1 }, () => defaultRestDensity, fixed(1)),
        knob('Max Temp', 'max-temp', maxTemp, { min: 420, max: () => defaultMaxTemp() * 2, step: 1 }, defaultMaxTemp, whole),
        knob('Gravity', 'gravity', gravityStrength, { min: 220, max: () => defaultGravityStrength() * 2, step: 1 }, defaultGravityStrength, whole),
        knob('Turb', 'turbulence', turbulence, { min: 0, max: 150, step: 1 }, () => defaultTurbulence),
        knob('Eddies', 'drifters', drifters, { min: 0, max: 6, step: 1 }, () => defaultDrifters),
        knob('Bottles', 'cup-depth', cupDepth, { min: 0, max: 2, step: 0.05 }, () => defaultCupDepth, fixed(2)),
        knob('Wobble', 'wobble', wobble, { min: 0, max: 2, step: 0.01 }, () => defaultWobble, seconds),
        knob('Smooth', 'smooth', smooth, { min: 0, max: 24, step: 1 }, () => defaultSmooth()),
        knob('Blend', 'blend', blend, { min: 0, max: 48, step: 1 }, () => defaultBlend())
      ),
      knobs(
        knob('Settle', 'settle', settle, { min: 1, max: 3, step: 1 }, () => defaultSettle),
        knob('Viscosity', 'viscosity', viscosity, { min: 0, max: 60, step: 1 }, () => defaultViscosity),
        knob('Kick', 'wobble-kick', wobbleKick, { min: 0, max: 10, step: 0.1 }, () => defaultWobbleKick),
        knob('Cap', 'wobble-max', wobbleMax, { min: 0.5, max: 10, step: 0.1 }, () => defaultWobbleMax, v => `${v} g`),
        knob('Reach', 'reach', reach, { min: 0.1, max: 2, step: 0.01 }, defaultReach, v => `${Number(v).toFixed(2)} r`),
        knob('Skin', 'skin', skin, { min: 0.1, max: 300, step: 0.1 }, () => defaultSkin, fixed(1)),
        knob('Wall', 'wall', wall, { min: 0, max: 50, step: 1 }, () => defaultWall, v => `${v} px`)
      ),
      // The heater (Robert: "the heaters get too hot for too long. We need some knobs to tweak
      // the heater pulses and heat and such").
      knobs(
        knob('Element', 'element-heat', elementHeat, { min: 1, max: 80, step: 1 }, () => defaultElementHeat),
        knob('Burn', 'element-life', elementLife, { min: 1, max: 30, step: 0.5 }, () => defaultElementLife, seconds),
        knob('Big Burn', 'element-life-scale', elementLifeScale, { min: 1, max: 8, step: 0.5 }, () => defaultElementLifeScale, times),
        knob('Pulses', 'element-rate', elementRate, { min: 0.5, max: 12, step: 0.5 }, () => defaultElementRate, fixed(1)),
        knob('Core', 'element-core', elementCore, { min: 0.02, max: 0.3, step: 0.01 }, () => defaultElementCore, fixed(2)),
        knob('Floor', 'floor-heat', floorHeat, { min: 0, max: 1, step: 0.05 }, () => defaultFloorHeat, fixed(2)),
        knob('Glow', 'floor-glow', floorGlow, { min: 0, max: 6, step: 0.1 }, () => defaultFloorGlow, fixed(1))
      ),
      hint(help, [
        ['Size', 'Radius of each drawn particle, so how fat the lava looks.'],
        ['Count', 'How many particles make up the visible lava; the pots below fill themselves on top.'],
        ['Radius', 'How far apart two particles can be and still feel each other.'],
        ['Stiff', 'How hard particles push apart when crowded and pull together when sparse.'],
        ['Near', 'An extra push at very close range that stops particles stacking.'],
        ['Density', 'The crowding the lava settles at; lower puffs it up, higher packs it.'],
        ['Max Temp', 'The hottest a particle can get, which is also the fastest it can rise.'],
        ['Gravity', 'How fast cold lava sinks; a particle at this temperature hovers.'],
        ['Turb', 'Strength of all the eddies, the ones that appear in place and the drifting tornadoes, and how often the in place ones appear.'],
        ['Eddies', 'How many drifting tornado eddies wander the lamp at once; Turb sets how strong they are.'],
        ['Bottles', 'How big the bottles above and the pots below are, as a fraction of their width; 0 is a flat ceiling and floor.'],
        ['Wobble', 'Inertia: how long the lava keeps moving the way it was going; 0 is thick wax, more makes pinched necks snap back and blobs jiggle.'],
        ['Smooth', 'Rounds off the bumps along every edge by blurring the lava\'s shape before it is cut, by this many pixels. 0 is the raw metaballs.'],
        ['Blend', 'How far the colours inside the lava blur into each other, in pixels, without touching the edge; below Smooth it does nothing extra.'],
        ['Settle', 'Pressure passes per frame. 2 spaces the particles more evenly so the surface is less bumpy, for most of a step\'s time again.'],
        ['Viscosity', 'How much neighbouring particles slow each other as they close in, so necks thin and tails pull in more slowly. Needs Wobble above 0.'],
        ['Kick', 'How much of the surface tension pull on a neck or a skin is carried on as velocity: the recoil when blobs part or merge.'],
        ['Cap', 'The fastest that carried velocity may get, in gravities.'],
        ['Reach', 'The most the pressure step may move a particle in one go, in radii. Low keeps a high Density from flying apart.'],
        ['Skin', 'Which particles take the Kick: those below this fraction of the mean density. 300 is all of them.'],
        ['Wall', 'Lava this close to a side wall is eased away from it, in px; a glass the wax does not wet.'],
        ['Element', 'How hard a lit heating element heats the lava over it, per step at its core. The lab\'s finger is 48.'],
        ['Burn', 'How long a lighting burns, at most, for the smallest pot; a wide burn is shorter. The lab\'s pulse is 3.4 s.'],
        ['Big Burn', 'How much longer the biggest pot burns than the smallest, at most; 1 makes every pot burn the same.'],
        ['Pulses', 'How many pots light per Heat interval, between them; small pots near the middle light most.'],
        ['Core', 'How wide a lit pot\'s hot core is at its narrowest, as a fraction of the shorter side; each lighting draws between this and the whole pot.'],
        ['Floor', 'The floor\'s contact heat when nothing is lit, as a share of full power.'],
        ['Glow', 'How much brighter the floor gets under a pot at full glow.']
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
