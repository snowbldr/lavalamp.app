import { button, div, fnstate, input, span } from '@srfnstack/fntags'
import { hint, knob, knobs, notify, pair, row, section, segmented, swatch, swatchRow, toggle, tooltips } from './components.js'
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
  reserve,
  defaultReserve,
  lift,
  defaultLift,
  pixels,
  defaultPixels,
  backendLabel,
  screenLabel,
  motionLabel,
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
  defaultPull,
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
  pull,
  saveSettings,
  getSettings,
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
  stiffnessNear,
  stir,
  turbulence,
  wobble
} from './settings.js'
import { CURRENT, goTo, versions } from '../versions.js'

// The Sound section is hidden for now, not removed: the gloops are not finished and this version
// goes up without them (Robert: "let's temporarily hide all the sound stuff from the settings so
// we can push up this version. I think next is sound"). Flip to true to show it again.
const SOUND_SHOWN = false

// Two sections: the top one for anyone (colours, what a finger does, the flow field, fullscreen)
// and Advanced, folded away, with its own folded groups: Flow, Heating, Particle physics,
// Rendering, Sound, and the seed. The knob labels are short because four knobs share a row.
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
  // Advanced and its groups, all folded by default.
  const advancedOpen = fnstate(false)
  const flowOpen = fnstate(false)
  const heatingOpen = fnstate(false)
  const physicsOpen = fnstate(false)
  const renderingOpen = fnstate(false)
  const soundOpen = fnstate(false)
  const help = fnstate(false) // the ? button: one sentence under every control

  // Every version of the lamp is kept and can be opened (Robert: "the ability to load old
  // versions of the lava lamp"); a newer one than this, when there is one, is offered first as
  // an upgrade that maps these settings onto it (src/versions.js). Filled once the manifest loads.
  const versionRow = div({ class: 'panel-note' }, `Version ${CURRENT}`)
  versions().then(list => {
    const newer = list.filter(v => Number(v.version) > Number(CURRENT))
    const older = list.filter(v => Number(v.version) < Number(CURRENT))
    versionRow.replaceChildren(
      span(`Version ${CURRENT}${newer.length ? '' : ', the newest'}. `),
      ...newer.map(v => button({ class: 'small primary', style: { 'margin-right': '6px' }, title: v.description, onclick: () => { if (confirm(`Upgrade to ${v.label}? These settings are mapped onto it; this version's save is kept.`)) window.location.href = `${v.path}&upgrade=${CURRENT}&from=${encodeURIComponent(btoa(JSON.stringify(getSettings())))}` } }, `Upgrade to ${v.label}`)),
      span('Older: '),
      ...older.map(v => button({ class: 'small', style: { 'margin-right': '6px' }, title: `${v.date}: ${v.description}`, onclick: () => goTo(v.version) }, v.label))
    )
  })
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
    // buttons sit in the corner beside the first colour row's caption. Always in view: the colours,
    // what a finger does, the flow field and fullscreen. Everything else is under Advanced, in
    // groups, all folded by default (Robert: "A lot of the controls we have are really power user
    // stuff that no normal human would understand").
    button({ class: 'panel-close', onclick: close, title: 'Close' }, '×'),
    button({ class: help.bindAttr(() => help() ? 'panel-close panel-help on' : 'panel-close panel-help'), onclick: () => help(!help()), title: 'What the controls do' }, '?'),
    section(
      null, null,
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
      row('Touch', segmented('touch', touchMode, touchModes)),
      hint(help, 'What a finger or the mouse does to the lava under it: shove it away, gather it in, spin it, heat it or cool it.'),
      pair('Flow Field', toggle('flow', showFlow), 'Fullscreen', toggle('fullscreen', fullscreen)),
      hint(help, [
        ['Flow Field', 'Draw the stirring as arrows, like wind on a weather map.'],
        ['Fullscreen', 'The lamp over the whole screen with nothing around it. Esc brings the browser back.']
      ])
    ),
    section(
      'Advanced', advancedOpen,
      div({ class: 'panel-note' }, backendLabel.bindAs(() => `Backend: ${backendLabel()}`)),
      div({ class: 'panel-note' }, screenLabel.bindAs(() => screenLabel())),
      div({ class: 'panel-note' }, motionLabel.bindAs(() => motionLabel())),
      versionRow,
      section(
        'Flow', flowOpen,
        knobs(
          knob('Stir', 'stir', stir, { min: -60, max: 60, step: 1 }, () => defaultStir),
          knob('Turb', 'turbulence', turbulence, { min: 0, max: () => Math.max(150, defaultTurbulence() * 2), step: 1 }, () => defaultTurbulence()),
          knob('Eddies', 'drifters', drifters, { min: 0, max: () => Math.max(6, defaultDrifters() * 2), step: 1 }, () => defaultDrifters()),
          knob('Pace', 'pace', pace, { min: 0.1, max: 1, step: 0.05 }, () => defaultPace, times)
        ),
        hint(help, [
          ['Stir', 'Speed of the slow convection roll, up the middle and down the walls; negative runs it backwards.'],
          ['Turb', 'Strength of all the eddies, the ones that appear in place and the drifting tornadoes, and how often the in place ones appear.'],
          ['Eddies', 'How many drifting tornado eddies wander the lamp at once; Turb sets how strong they are.'],
          ['Pace', 'Slow motion for the whole lamp.']
        ])
      ),
      section(
        'Heating', heatingOpen,
        // The heater (Robert: "the heaters get too hot for too long. We need some knobs to tweak
        // the heater pulses and heat and such").
        knobs(
          knob('Period', 'heat-spots', heatSpots, { min: 0, max: 60, step: 1 }, () => defaultHeatSpots(), seconds),
          knob('Conduct', 'conduction', conduction, { min: 0, max: 1, step: 0.01 }, () => defaultConduction(), fixed(2)),
          knob('Max Temp', 'max-temp', maxTemp, { min: 420, max: () => defaultMaxTemp() * 2, step: 1 }, defaultMaxTemp, whole),
          knob('Heat', 'element-heat', elementHeat, { min: 1, max: () => Math.max(40, defaultElementHeat() * 4), step: 1 }, () => defaultElementHeat()),
          knob('Duration', 'element-life', elementLife, { min: 1, max: 30, step: 0.5 }, () => defaultElementLife(), seconds),
          knob('Big pot', 'element-life-scale', elementLifeScale, { min: 1, max: 8, step: 0.5 }, () => defaultElementLifeScale, times),
          knob('Pulses', 'element-rate', elementRate, { min: 0.5, max: 12, step: 0.5 }, () => defaultElementRate(), fixed(1)),
          knob('Core', 'element-core', elementCore, { min: 0.02, max: 0.3, step: 0.01 }, () => defaultElementCore(), fixed(2)),
          knob('Floor', 'floor-heat', floorHeat, { min: 0, max: 1, step: 0.05 }, () => defaultFloorHeat, fixed(2)),
          knob('Glow', 'floor-glow', floorGlow, { min: 0, max: 6, step: 0.1 }, () => defaultFloorGlow, fixed(1))
        ),
        hint(help, [
          ['Period', 'Seconds between rounds of pots lighting under the lava: lower is more often. 0 keeps the whole floor warm instead.'],
          ['Conduct', 'How fast heat spreads between touching lava. High and a blob warms and lifts as one; too high and a rising blob heats the pool below it through its neck and feeds the stretch.'],
          ['Max Temp', 'The hottest a particle can get, which is also the fastest it can rise.'],
          ['Heat', 'How strongly a lit pot heats the lava in it: higher heats faster.'],
          ['Duration', 'How long a pot stays lit, in seconds, for the smallest pot. Bigger pots stay lit longer, up to Big pot times this.'],
          ['Big pot', 'Duration multiplier for the biggest pot: how many times longer it stays lit than the smallest. 1 lights every pot for the same time.'],
          ['Pulses', 'How many pots light per Period, between them; small pots near the middle light most.'],
          ['Core', 'How wide a lit pot\'s hot core is at its narrowest, as a fraction of the shorter side; each lighting draws between this and the whole pot.'],
          ['Floor', 'The floor\'s contact heat when nothing is lit, as a share of full power.'],
          ['Glow', 'How much brighter the floor gets under a pot at full glow.']
        ])
      ),
      section(
        'Particle physics', physicsOpen,
        knobs(
          knob('Count', 'particle-count', particleCount, { min: 5, max: () => Math.trunc(defaultParticleCount()) * 2, step: 1 }, defaultParticleCount, whole),
          knob('Radius', 'interaction-radius', interactionRadius, { min: 5, max: () => Math.max(100, defaultInteractionRadius() * 2), step: 1 }, () => defaultInteractionRadius()),
          knob('Pull', 'pull', pull, { min: 10, max: () => defaultPull() * 4, step: 10 }, () => defaultPull(), whole),
          knob('Near', 'stiffness-near', stiffnessNear, { min: 1, max: () => defaultStiffnessNear() * 4, step: 10 }, () => defaultStiffnessNear()),
          knob('Gravity', 'gravity', gravityStrength, { min: 220, max: () => defaultGravityStrength() * 2, step: 1 }, defaultGravityStrength, whole),
          knob('Bottles', 'cup-depth', cupDepth, { min: 0, max: 2, step: 0.05 }, () => defaultCupDepth, fixed(2)),
          knob('Reserve', 'reserve', reserve, { min: 0.25, max: 8, step: 0.25 }, () => defaultReserve(), v => v >= 8 ? 'all' : times(v)),
          knob('Lift', 'lift', lift, { min: 0.5, max: 10, step: 0.5 }, () => defaultLift(), v => v >= 10 ? 'none' : `${Number(v).toFixed(1)} g`),
          knob('Wobble', 'wobble', wobble, { min: 0, max: 2, step: 0.01 }, () => defaultWobble, seconds),
          knob('Settle', 'settle', settle, { min: 1, max: 3, step: 1 }, () => defaultSettle),
          knob('Viscosity', 'viscosity', viscosity, { min: 0, max: 60, step: 1 }, () => defaultViscosity()),
          knob('Kick', 'wobble-kick', wobbleKick, { min: 0, max: () => Math.max(10, defaultWobbleKick() * 2), step: 0.1 }, () => defaultWobbleKick()),
          knob('Cap', 'wobble-max', wobbleMax, { min: 0.5, max: 10, step: 0.1 }, () => defaultWobbleMax(), v => `${v} g`),
          knob('Reach', 'reach', reach, { min: 0.1, max: () => defaultReach() < 1 ? 0.5 : 2, step: 0.01 }, defaultReach, v => `${Number(v).toFixed(2)} r`),
          knob('Skin', 'skin', skin, { min: 0.1, max: 300, step: 0.1 }, () => defaultSkin, fixed(1)),
          knob('Wall', 'wall', wall, { min: 0, max: 50, step: 1 }, () => defaultWall, v => `${v} px`)
        ),
        hint(help, [
          ['Count', 'How many particles make up the visible lava; the pots below fill themselves on top.'],
          ['Radius', 'How far apart two particles can be and still feel each other.'],
          ['Pull', 'How hard every particle pulls on its neighbours within the Radius: the cohesion. Was Stiff times Density.'],
          ['Near', 'The push at close range that balances the Pull: it sets how close particles sit at rest, and a low Near lets the surface pack into a skin.'],
          ['Gravity', 'How fast cold lava sinks; a particle at this temperature hovers.'],
          ['Bottles', 'How big the bottles above and the pots below are, as a fraction of their width; 0 is a flat ceiling and floor.'],
          ['Reserve', 'How much lava the pots under the floor may hold, as a multiple of the visible lava; all is no cap. The pots are sized by the window, so at a coarse grain they can hold several times the pool and every step pays for it.'],
          ['Lift', 'The most buoyancy one particle may carry, in gravities. With no cap a particle heated at the line can leave the liquid alone at several gravities, a spray of single dots.'],
          ['Wobble', 'Inertia: how long the lava keeps moving the way it was going; 0 is thick wax, more makes pinched necks snap back and blobs jiggle.'],
          ['Settle', 'Pressure passes per frame. 2 spaces the particles more evenly so the surface is less bumpy, for most of a step\'s time again.'],
          ['Viscosity', 'How much neighbouring particles slow each other as they close in, so necks thin and tails pull in more slowly. Needs Wobble above 0.'],
          ['Kick', 'How much of the surface tension pull on a neck or a skin is carried on as velocity: the recoil when blobs part or merge.'],
          ['Cap', 'The fastest that carried velocity may get, in gravities.'],
          ['Reach', 'The most the pressure step may move a particle in one go, in radii. The GPU solver is capped at 0.5: above it a packed cold pool bursts or settles into a honeycomb.'],
          ['Skin', 'Which particles take the Kick: those below this fraction of the mean density. 300 is all of them.'],
          ['Wall', 'Lava this close to a side wall is eased away from it, in px; a glass the wax does not wet.']
        ])
      ),
      section(
        'Rendering', renderingOpen,
        knobs(
          knob('Size', 'particleSize', particleSize, { min: 1, max: 50, step: 1 }, () => defaultParticleSize()),
          knob('Smooth', 'smooth', smooth, { min: 0, max: 24, step: 1 }, () => defaultSmooth()),
          knob('Blend', 'blend', blend, { min: 0, max: 48, step: 1 }, () => defaultBlend()),
          knob('Pixels', 'pixels', pixels, { min: 0.5, max: 4, step: 0.5 }, () => defaultPixels, v => `${Number(v).toFixed(1)} M`)
        ),
        pair('Heater', toggle('heater', showHeater), 'Reservoirs', toggle('cups', showCups)),
        hint(help, [
          ['Size', 'Radius of each drawn particle, so how fat the lava looks.'],
          ['Smooth', 'Rounds off the bumps along every edge by blurring the lava\'s shape before it is cut, by this many pixels. 0 is the raw metaballs.'],
          ['Blend', 'How far the colours inside the lava blur into each other, in pixels, without touching the edge; below Smooth it does nothing extra.'],
          ['Pixels', 'The budget the lamp is drawn within, in megapixels. A big window is drawn at half resolution within one megapixel, where a Size under 4 is a single pixel dot. Not saved.'],
          ['Heater', 'Show the heater strip and its elements along the floor.'],
          ['Reservoirs', 'Pull the whole lamp into frame, the hidden bottles above and pots below and all, so you can watch the lava in them; with Heater on, the pots light up as their heaters do.']
        ])
      ),
      ...(SOUND_SHOWN
        ? [section(
          'Sound', soundOpen,
          pair('Sound', div({ class: soundPending.bindAttr(() => soundPending() ? 'pending' : '') }, toggle('sound', sound))),
          row('Bed', segmented('bed', soundBed, soundBeds)),
          hint(help, 'Gloops made up from the lava as it moves: a bloop where a neck snaps or a blob lands, pitched by how much lava moved, and a bed that follows how stirred up the lava is: Simmer is a scatter of tiny pops, Noise a low rumble, Hum a drone.')
        )]
        : []),
      row('Seed', div({ class: 'seed-row' }, seedField, button({ class: 'small', onclick: () => reloadWithSeed(randomSeed()), title: 'A fresh random seed' }, 'New'))),
      hint(help, 'The random seed behind this lamp: the same seed on the same window gives the same cups, elements and eddies. Type one or press New; either reloads. Save keeps it.')
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

  tooltips(panel)
  return { element: panel, open, close }
}
