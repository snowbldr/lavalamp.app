import { a, button, div, fnstate, input, span } from '@srfnstack/fntags'
import { TOUCH_UI, group, helpList, hint, iconChoice, knob, knobStyle, knobStyles, knobs, notify, pair, row, section, sectionWith, segmented, subgroup, swatch, swatchRow, toggle, tooltips } from './components.js'
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
  autoPixels,
  targetFps,
  defaultTargetFps,
  backendLabel,
  screenLabel,
  motionLabel,
  fpsLabel,
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
  music,
  musicPending,
  musicSource,
  musicSources,
  musicFileName,
  musicRecording,
  musicSensitivity,
  defaultMusicSensitivity,
  musicEvery,
  defaultMusicEvery,
  musicTempo,
  musicPulse,
  musicSpawn,
  musicSpin,
  musicLead,
  defaultMusicLead,
  musicActivity,
  defaultMusicActivity,
  musicDrop,
  defaultMusicDrop,
  musicBoom,
  defaultMusicBoom,
  musicBusyEddies,
  defaultMusicBusyEddies,
  musicFlip,
  defaultMusicFlip,
  musicWobble,
  defaultMusicWobble,
  musicVent,
  defaultMusicVent,
  defaultMusicMotion,
  showSpectrum,
  defaultMusicRanges,
  musicBeatLo,
  musicBeatHi,
  musicHeatLo,
  musicHeatHi,
  musicEddyLo,
  musicEddyHi,
  musicKickLo,
  musicKickHi,
  musicFloor,
  defaultMusicFloor,
  musicLift,
  defaultMusicLift,
  musicTurb,
  defaultMusicTurb,
  musicKick,
  defaultMusicKick,
  showHeater,
  touchMode,
  touchModes,
  touchStrength,
  defaultTouchStrength,
  eddySpeed,
  defaultEddySpeed,
  eddyFalloff,
  defaultEddyFalloff,
  eddyCurve,
  eddyCurves,
  stiffnessNear,
  stir,
  turbulence,
  wobble
} from './settings.js'
import { CURRENT, goTo, versions } from '../versions.js'

// The gloops (the lava's own sounds) are hidden for now, not removed: they are not finished
// (Robert: "let's temporarily hide all the sound stuff from the settings so we can push up this
// version"). Flip to true to show their switch in the Music card again.
const GLOOPS_SHOWN = false // the music is shown; the gloops wait (Robert: "the lava sound stuff is supposed to be hidden")

// The touch modes as pictures: arrows out, arrows in, a circling arrow, a flame, a snowflake.
const ICON = body => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
const TOUCH_OPTIONS = [
  { value: 'push', label: 'Push', title: 'Shove the lava away from your finger', svg: ICON('<circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M12 8V3m-3 2 3-2 3 2M12 16v5m-3-2 3 2 3-2M8 12H3m2-3-2 3 2 3M16 12h5m-2-3 2 3-2 3"/>') },
  { value: 'pull', label: 'Pull', title: 'Gather the lava in to your finger', svg: ICON('<circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M12 3v5M9 6l3 2 3-2M12 21v-5m-3 2 3-2 3 2M3 12h5M6 9l2 3-2 3M21 12h-5m2-3-2 3 2 3"/>') },
  { value: 'spin', label: 'Spin', title: 'Whirl the lava around your finger', svg: ICON('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 3v4.5H15"/>') },
  { value: 'heat', label: 'Heat', title: 'Warm the lava so it rises', svg: ICON('<path d="M12 3c1 3.5 5 5 5 9.5a5 5 0 0 1-10 0c0-1.8.7-3.2 1.8-4.4.2 1.4.9 2.4 2 3C10.6 8.6 10.8 5.8 12 3z"/>') },
  { value: 'cool', label: 'Cool', title: 'Chill the lava so it sinks', svg: ICON('<path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19"/><path d="M12 2 9.5 4.5M12 2l2.5 2.5M12 22l-2.5-2.5M12 22l2.5-2.5M2 12l2.5-2.5M2 12l2.5 2.5M22 12l-2.5-2.5M22 12l-2.5 2.5"/>') }
]

// Two sections: the top one for anyone (colours, what a finger does, the flow field, fullscreen)
// and Advanced, folded away, with its own folded groups: Flow, Heating, Particle physics,
// Rendering, Music, and the seed. The knob labels are short because four knobs share a row.
const seconds = v => `${v} s`
const whole = v => String(Math.round(v))
const fixed = digits => v => Number(v).toFixed(digits)
const always = fnstate(true)
const isPresets = fnstate(true)
const isTwoTone = fnstate(false)
const isLuminance = fnstate(false)
gradientKind.subscribe(kind => { isPresets(kind === 'presets'); isTwoTone(kind === 'duotone'); isLuminance(kind === 'mono') })
const times = v => `${Number(v).toFixed(2)}x`
// The frequency range knobs, 20 Hz to 12 kHz.
const HZ = { min: 20, max: 12000, step: 10 }
const hz = v => v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${v} Hz`

export function createSettingsPanel () {
  let panel
  // Advanced and its groups, all folded by default.
  const advancedOpen = fnstate(false)
  // The music meter: three bars (bass, mids, highs) and a beat dot, written straight to the
  // DOM once a frame while listening, which is the cheapest thing a panel can do.
  const meterBars = [div(), div(), div()]
  const meterBeat = div({ class: 'meter-beat' })
  // The song picker for the File source: the file is read and handed to the lamp (app.js) by an
  // event, like the recorder's Save, so the panel needs no handle on it.
  const songPicker = input({ type: 'file', accept: 'audio/*', style: { display: 'none' } })
  songPicker.addEventListener('change', async () => {
    const file = songPicker.files[0]
    if (!file) return
    const data = await file.arrayBuffer()
    window.dispatchEvent(new CustomEvent('lavalamp-music-file', { detail: { name: file.name.replace(/\.[^.]+$/, ''), data } }))
    songPicker.value = ''
  })
  document.body.append(songPicker)
  const meterRow = div({ class: 'meter', title: 'Bass, mids, highs; the dot flashes on the beat' }, ...meterBars.map(b => div({ class: 'meter-bar' }, b)), meterBeat)
  const meter = levels => {
    meterBars[0].style.width = `${Math.min(100, levels.bass * 100)}%`
    meterBars[1].style.width = `${Math.min(100, levels.mid * 100)}%`
    meterBars[2].style.width = `${Math.min(100, levels.high * 100)}%`
    meterBeat.style.background = `rgba(232, 232, 234, ${0.12 + 0.88 * levels.beat})`
  }
  const help = fnstate(false) // the ? button: one sentence under every control
  const loopbackHelp = fnstate(false)
  const musicOpen = fnstate(false)
  // The audio inputs, filled from the browser (names only appear once the microphone has been
  // allowed, so the list is asked for again when listening starts and when a device comes or goes).
  const inputSelect = document.createElement('select')
  inputSelect.className = 'music-select'
  let inputs = null
  const fillInputs = async () => {
    if (!inputs) return
    const list = await inputs.list()
    const current = inputs.get()
    inputSelect.replaceChildren(...[{ id: '', label: 'Default input' }, ...list.filter(d => d.id && d.id !== 'default')].map(d => { const o = document.createElement('option'); o.value = d.id; o.textContent = d.label; o.selected = d.id === current; return o }))
  }
  inputSelect.addEventListener('change', () => inputs && inputs.set(inputSelect.value))
  const setMusicInputs = x => { inputs = x; fillInputs(); if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', fillInputs) }
  music.subscribe(on => { if (on) setTimeout(fillInputs, 800) })

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
    { class: knobStyle.bindAttr(() => knobStyle() === 'sliders' ? 'panel sliders' : 'panel'), onclick: e => e.stopPropagation() },
    // No title bar (Robert: "remove the lavalamp.app from the panel tons of wasted space"); the
    // buttons sit in the corner beside the first colour row's caption. Always in view: the colours,
    // what a finger does, the flow field and fullscreen. Everything else is under Advanced, in
    // groups, all folded by default (Robert: "A lot of the controls we have are really power user
    // stuff that no normal human would understand").
    // A bar across the top with the close button, small to look at, with a hit area the size of a
    // fingertip; the colours card sits under it with no title of its own (Robert: "x and ? look
    // bad on the panel. We should remove 'Colours' and 'how the heat is painted' and move the
    // colors card below the buttons. possibly make the buttons a bit smaller too, but keep the
    // hitboxes bigger so they're still easy on mobile").
    button({ class: 'panel-close', onclick: close, title: 'Close', 'aria-label': 'Close' }, '×'),
    div(
      { class: 'panel-scroll' },
    section(
      null, null,
      // The colours as a boxed sub panel like Touch (Robert: "Let's do the colors in a sub panel
      // like that too").
      div({ class: 'sub-panel' },
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
      hint(help, 'The lava is coloured by its heat, coldest and sinking to hottest. Presets are six gradients that jump hue; Duotone runs from one colour to another; Mono runs one colour from dark to light. The swatches above still change any single stop, and the flow colours are the slowest to fastest arrow.')
      ),
      // Touch as its own boxed sub panel with pictures: a plain row of words was invisible to a
      // thirteen year old (Robert: "I want to make it look more like a sub panel").
      div({ class: 'sub-panel' },
        div({ class: 'sub-title' }, span('Touch'), span({ class: 'sub-sub' }, 'what your finger does to the lava')),
        iconChoice('touch', touchMode, TOUCH_OPTIONS),
        knobs(knob('Strength', 'touch-strength', touchStrength, { min: 0, max: 3, step: 0.1, slider: true }, () => defaultTouchStrength, v => `${Number(v).toFixed(1)}x`))
      ),
      hint(help, 'What a finger or the mouse does to the lava under it: Push shoves it away, Pull gathers it in, Spin whirls it, Heat and Cool change its temperature. Strength is how hard, 1x as tuned.'),
      // Music in the top section, always in view, folded to its switch (Robert: "let's put music
      // as a default collapsible group under touch, always visible. It should just have the button
      // to enable it and set the device. The remaining controls should be in the advanced").
      div({ class: musicOpen.bindAttr(() => musicOpen() ? 'sub-panel' : 'sub-panel folded') },
        div({ class: 'sub-title foldable', onclick: e => { if (!e.target.closest('.toggle')) musicOpen(!musicOpen()) } },
          span('Music'),
          span({ style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            div({ class: musicPending.bindAttr(() => musicPending() ? 'pending' : '') }, toggle('music', music)),
            span({ class: 'chevron' }, '▾')
          )
        ),
        div({ class: 'sub-body' },
          // The meter up here with the switch, so the card shows it hearing (Robert: "we should move
          // this sound indicator to the main audio controls... in the expanded form").
          meterRow,
          ...(musicSources.length > 1 ? [row('Source', segmented('music-source', musicSource, musicSources))] : []),
          // System audio comes only with a screen share, so say plainly what is and is not used
          // (Robert: "a note explaining that it's required in order to hear the audio playing on
          // the system and that we do not record any visuals from the screen or connect to any
          // devices like webcam and only use the audio stream from the screen share").
          div({ class: 'music-note', style: { display: musicSource.bindStyle(() => musicSource() === 'system' ? 'block' : 'none') } },
            'To hear what your computer is playing, the browser has to ask to share your screen, because that is the only way it hands a page the system\'s audio. Pick a screen and tick "Share system audio" (or a tab and "Share tab audio"). Only the sound is used: the picture is switched off the moment it arrives and is never shown, kept or sent, nothing is recorded, and no camera or other device is touched.'
          ),
          div({ class: 'music-note', style: { display: TOUCH_UI ? 'block' : 'none' } },
            'On a phone the lamp listens through the microphone: play the song out loud and it follows along.'
          ),
          // A song file: the page plays it out loud and the lamp hears it exactly; Record plays it
          // from the top and saves the lamp with its sound as a video when it ends or is stopped.
          div({ class: 'music-file', style: { display: musicSource.bindStyle(() => musicSource() === 'file' ? 'block' : 'none') } },
            row('Song', button({ class: 'music-pick', onclick: () => songPicker.click() }, musicFileName.bindAs(() => musicFileName() || 'Choose a song...'))),
            row('Record', toggle('music-record', musicRecording)),
            div({ class: 'music-note' }, 'Record plays the song from the start and records the lamp with it, then saves the video when the song ends or you switch it off. Only the lamp is recorded, not this panel. Keep this tab in front while it records.')
          ),
          div({ class: 'music-input', style: { display: musicSource.bindStyle(() => musicSource() === 'mic' ? 'grid' : 'none') } },
            span({ class: 'row-label' }, 'Input'), inputSelect
          ),
          // A loopback driver hears every app with no share dialog (Robert: "a little clickable
          // help thing that suggests installing and setting up black hole. should be hidden on
          // mobile").
          ...(TOUCH_UI ? [] : [
            button({ class: 'music-help-link', onclick: () => loopbackHelp(!loopbackHelp()) }, 'Hear every app, no share dialog (Mac)'),
            div({ class: 'music-note', style: { display: loopbackHelp.bindStyle(() => loopbackHelp() ? 'block' : 'none') } },
              div('1. Install BlackHole 2ch, a free audio loopback driver: ', a({ href: 'https://existential.audio/blackhole/', target: '_blank', rel: 'noopener', class: 'music-link' }, 'existential.audio/blackhole'), ', or "brew install blackhole-2ch" in a terminal.'),
              div('2. Open Audio MIDI Setup, press +, Create Multi-Output Device, and tick your speakers and BlackHole 2ch.'),
              div('3. In System Settings, Sound, choose that Multi-Output Device as the output, so you still hear the music.'),
              div('4. Here, choose Mic as the source and BlackHole 2ch as the Input, then Listen.'),
              div('On Windows, VB-Audio Virtual Cable does the same job.')
            )
          ]),
        )
      ),
      hint(help, 'Music: the switch makes the lamp listen and move to the music. Mic hears whatever is playing in the room, or any input you choose; System, on a computer, hears what the computer plays, through a screen share of which only the sound is used. What the music does is under Advanced, Music.'),
      pair('Flow Field', toggle('flow', showFlow), 'Fullscreen', toggle('fullscreen', fullscreen)),
      hint(help, [
        ['Flow Field', 'Draw the stirring as arrows, like wind on a weather map.'],
        ['Fullscreen', 'The lamp over the whole screen with nothing around it. Esc brings the browser back.']
      ])
    ),
    sectionWith(
      button({ class: help.bindAttr(() => help() ? 'panel-close panel-help on' : 'panel-close panel-help'), onclick: () => help(!help()), title: 'What the controls do', 'aria-label': 'What the controls do' }, '?'),
      'Advanced', advancedOpen,
      row('Controls', segmented('knob-style', knobStyle, knobStyles)),
      div({ class: 'panel-note' }, backendLabel.bindAs(() => `Backend: ${backendLabel()}`)),
      div({ class: 'panel-note' }, fpsLabel.bindAs(() => fpsLabel())),
      div({ class: 'panel-note' }, screenLabel.bindAs(() => screenLabel())),
      div({ class: 'panel-note' }, motionLabel.bindAs(() => motionLabel())),
      versionRow,
      // One long list under headings, no folding inside Advanced, each group split a layer
      // further (Robert: "The advanced panel should become one giant list. we may want to break
      // up the groups a bit further, perhaps another layer of subgroups").
      group('Flow',
        subgroup('Roll',
            knob('Stir', 'stir', stir, { min: -60, max: 60, step: 1 }, () => defaultStir)
          ),
        subgroup('Eddies',
            knob('Turb', 'turbulence', turbulence, { min: 0, max: () => Math.max(900, defaultTurbulence() * 6), step: 1 }, () => defaultTurbulence()),
            knob('Eddies', 'drifters', drifters, { min: 0, max: () => Math.max(6, defaultDrifters() * 2), step: 1 }, () => defaultDrifters())
          ),
        subgroup('Clock',
            knob('Pace', 'pace', pace, { min: 0.1, max: 1, step: 0.05 }, () => defaultPace, times)
          ),
        subgroup('Travel',
            knob('Speed', 'eddy-speed', eddySpeed, { min: 10, max: 1000, step: 5 }, () => defaultEddySpeed, v => `${v} px/s`),
            knob('Fall off', 'eddy-falloff', eddyFalloff, { min: 0, max: 4, step: 0.1 }, () => defaultEddyFalloff, fixed(1))
          ),
        row('Curve', segmented('eddy-curve', eddyCurve, eddyCurves)),
        helpList(help, [
          ['Speed', 'How fast an eddy comes in from the edge at birth, in px/s; each is a little faster or slower than the knob.'],
          ['Fall off', 'How quickly an eddy loses that speed with age; 0 keeps it. It never drops below 15% of its birth speed.'],
          ['Curve', 'The shape of the slowing: log falls fast then hobbles on, linear runs down steadily, exp drops off and levels.'],
          ['Stir', 'Speed of the slow convection roll, up the middle and down the walls; negative runs it backwards.'],
          ['Turb', 'Strength of all the eddies, the ones that appear in place and the drifting tornadoes, and how often the in place ones appear.'],
          ['Eddies', 'How many drifting tornado eddies wander the lamp at once; Turb sets how strong they are.'],
          ['Pace', 'Slow motion for the whole lamp.']
        ])
      ),
      group('Heating',
        subgroup('Lava',
            knob('Conduct', 'conduction', conduction, { min: 0, max: 1, step: 0.01 }, () => defaultConduction(), fixed(2)),
            knob('Max Temp', 'max-temp', maxTemp, { min: 420, max: () => defaultMaxTemp() * 2, step: 1 }, defaultMaxTemp, whole)
          ),
        subgroup('Pots',
            knob('Period', 'heat-spots', heatSpots, { min: 0, max: 60, step: 1 }, () => defaultHeatSpots(), seconds),
            knob('Heat', 'element-heat', elementHeat, { min: 1, max: () => Math.max(40, defaultElementHeat() * 4), step: 1 }, () => defaultElementHeat()),
            knob('Duration', 'element-life', elementLife, { min: 1, max: 30, step: 0.5 }, () => defaultElementLife(), seconds),
            knob('Big pot', 'element-life-scale', elementLifeScale, { min: 1, max: 8, step: 0.5 }, () => defaultElementLifeScale, times),
            knob('Pulses', 'element-rate', elementRate, { min: 0.5, max: 12, step: 0.5 }, () => defaultElementRate(), fixed(1)),
            knob('Core', 'element-core', elementCore, { min: 0.02, max: 0.3, step: 0.01 }, () => defaultElementCore(), fixed(2))
          ),
        subgroup('Floor',
            knob('Floor', 'floor-heat', floorHeat, { min: 0, max: 1, step: 0.05 }, () => defaultFloorHeat, fixed(2)),
            knob('Glow', 'floor-glow', floorGlow, { min: 0, max: 6, step: 0.1 }, () => defaultFloorGlow, fixed(1))
          ),
        helpList(help, [
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
      group('Liquid',
        subgroup('Grain',
            knob('Count', 'particle-count', particleCount, { min: 5, max: () => Math.trunc(defaultParticleCount()) * 2, step: 1 }, defaultParticleCount, whole),
            knob('Radius', 'interaction-radius', interactionRadius, { min: 5, max: () => Math.max(100, defaultInteractionRadius() * 2), step: 1 }, () => defaultInteractionRadius())
          ),
        subgroup('Reservoirs',
            knob('Bottles', 'cup-depth', cupDepth, { min: 0, max: 2, step: 0.05 }, () => defaultCupDepth, fixed(2)),
            knob('Reserve', 'reserve', reserve, { min: 0.25, max: 8, step: 0.25 }, () => defaultReserve(), v => v >= 8 ? 'all' : times(v))
          ),
        subgroup('Forces',
            knob('Pull', 'pull', pull, { min: 10, max: () => defaultPull() * 4, step: 10 }, () => defaultPull(), whole),
            knob('Near', 'stiffness-near', stiffnessNear, { min: 1, max: () => defaultStiffnessNear() * 4, step: 10 }, () => defaultStiffnessNear()),
            knob('Gravity', 'gravity', gravityStrength, { min: 220, max: () => defaultGravityStrength() * 2, step: 1 }, defaultGravityStrength, whole),
            knob('Lift', 'lift', lift, { min: 0.5, max: 10, step: 0.5 }, () => defaultLift(), v => v >= 10 ? 'none' : `${Number(v).toFixed(1)} g`)
          ),
        subgroup('Motion',
            knob('Wobble', 'wobble', wobble, { min: 0, max: 2, step: 0.01 }, () => defaultWobble, seconds),
            knob('Kick', 'wobble-kick', wobbleKick, { min: 0, max: () => Math.max(10, defaultWobbleKick() * 2), step: 0.1 }, () => defaultWobbleKick()),
            knob('Cap', 'wobble-max', wobbleMax, { min: 0.5, max: 10, step: 0.1 }, () => defaultWobbleMax(), v => `${v} g`),
            knob('Viscosity', 'viscosity', viscosity, { min: 0, max: 60, step: 1 }, () => defaultViscosity())
          ),
        subgroup('Solver',
            knob('Settle', 'settle', settle, { min: 1, max: 3, step: 1 }, () => defaultSettle),
            knob('Reach', 'reach', reach, { min: 0.1, max: () => defaultReach() < 1 ? 0.5 : 2, step: 0.01 }, defaultReach, v => `${Number(v).toFixed(2)} r`),
            knob('Skin', 'skin', skin, { min: 0.1, max: 300, step: 0.1 }, () => defaultSkin, fixed(1)),
            knob('Wall', 'wall', wall, { min: 0, max: 50, step: 1 }, () => defaultWall, v => `${v} px`)
          ),
        helpList(help, [
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
      group('Rendering',
        subgroup('Look',
            knob('Size', 'particleSize', particleSize, { min: 1, max: 50, step: 1 }, () => defaultParticleSize()),
            knob('Smooth', 'smooth', smooth, { min: 0, max: 24, step: 1 }, () => defaultSmooth()),
            knob('Blend', 'blend', blend, { min: 0, max: 48, step: 1 }, () => defaultBlend())
          ),
        subgroup('Budget',
            knob('Pixels', 'pixels', pixels, { min: 0.5, max: () => Math.max(4, Math.ceil(window.innerWidth * window.innerHeight / 1e6)), step: 0.5 }, () => defaultPixels, v => `${Number(v).toFixed(2)} M`),
            knob('Target', 'target-fps', targetFps, { min: 20, max: 120, step: 5 }, () => defaultTargetFps, v => `${v} fps`)
          ),
        pair('Auto Pixels', toggle('auto-pixels', autoPixels)),
        pair('Heater', toggle('heater', showHeater), 'Reservoirs', toggle('cups', showCups)),
        helpList(help, [
          ['Size', 'Radius of each drawn particle, so how fat the lava looks.'],
          ['Smooth', 'Rounds off the bumps along every edge by blurring the lava\'s shape before it is cut, by this many pixels. 0 is the raw metaballs.'],
          ['Blend', 'How far the colours inside the lava blur into each other, in pixels, without touching the edge; below Smooth it does nothing extra.'],
          ['Pixels', 'The budget the lamp is drawn within, in megapixels. A big window is drawn at half resolution within one megapixel, where a Size under 4 is a single pixel dot. Not saved.'],
          ['Auto Pixels', 'The lamp picks Pixels itself: down a step after two seconds under Target, up a step after four seconds well over it, never past the window\'s own size. Moving Pixels by hand switches this off.'],
          ['Target', 'The frame rate Auto Pixels holds.'],
          ['Heater', 'Show the heater strip and its elements along the floor.'],
          ['Reservoirs', 'Pull the whole lamp into frame, the hidden bottles above and pots below and all, so you can watch the lava in them; with Heater on, the pots light up as their heaters do.']
        ])
      ),
      // The lamp listening to music, a card like the other groups (Robert: "why is sound a
      // collapsed group by default when all the others are cards?"). The gloops stay hidden
      // until they are finished (Robert: "the lava sound stuff is supposed to be hidden").
      group('Music',
        subgroup('Response',
            knob('Sense', 'music-sensitivity', musicSensitivity, { min: 0.2, max: 5, step: 0.1 }, () => defaultMusicSensitivity, times),
            knob('Every', 'music-every', musicEvery, { min: 1, max: 32, step: 1 }, () => defaultMusicEvery, v => `${v} beats`),
            knob('Floor', 'music-floor', musicFloor, { min: 0, max: 4, step: 0.1 }, () => defaultMusicFloor, times),
            knob('Lift', 'music-lift', musicLift, { min: 0, max: 3, step: 0.1 }, () => defaultMusicLift, times),
            knob('Eddies', 'music-turb', musicTurb, { min: 0, max: 4, step: 0.1 }, () => defaultMusicTurb, times),
            knob('Kick', 'music-kick', musicKick, { min: 0, max: 3, step: 0.1 }, () => defaultMusicKick, times)
          ),
        subgroup('Timing',
            knob('Lead', 'music-lead', musicLead, { min: 0, max: 4, step: 0.1 }, () => defaultMusicLead, seconds),
            knob('Activity', 'music-activity', musicActivity, { min: 0, max: 1, step: 0.05 }, () => defaultMusicActivity, fixed(2)),
            knob('Drop', 'music-drop', musicDrop, { min: 0, max: 3, step: 0.1 }, () => defaultMusicDrop, times),
            knob('Boom', 'music-boom', musicBoom, { min: 0, max: 3, step: 0.1 }, () => defaultMusicBoom, times),
            knob('Glob', 'music-vent', musicVent, { min: 0, max: 0.4, step: 0.02 }, () => defaultMusicVent, fixed(2))
          ),
        subgroup('Motion',
            knob('Tempo', 'music-tempo', musicTempo, { min: 0, max: 1, step: 0.05 }, () => defaultMusicMotion.tempo, fixed(2)),
            knob('Pulse', 'music-pulse', musicPulse, { min: 0, max: 1, step: 0.05 }, () => defaultMusicMotion.pulse, fixed(2)),
            knob('Spawn', 'music-spawn', musicSpawn, { min: 0, max: 1, step: 0.05 }, () => defaultMusicMotion.spawn, fixed(2)),
            knob('Spin', 'music-spin', musicSpin, { min: 0, max: 1, step: 0.05 }, () => defaultMusicMotion.spin, fixed(2)),
            knob('Busy eddies', 'music-busy-eddies', musicBusyEddies, { min: 0, max: 8, step: 1 }, () => defaultMusicBusyEddies, fixed(0)),
            knob('Flip', 'music-flip', musicFlip, { min: 0, max: 1, step: 0.05 }, () => defaultMusicFlip, fixed(2)),
            knob('Wobble', 'music-wobble', musicWobble, { min: 0, max: 3, step: 0.1 }, () => defaultMusicWobble, fixed(1))
          ),
        subgroup('Ranges',
            knob('Beat Lo', 'music-beat-lo', musicBeatLo, HZ, () => defaultMusicRanges.beatLo, hz),
            knob('Beat Hi', 'music-beat-hi', musicBeatHi, HZ, () => defaultMusicRanges.beatHi, hz),
            knob('Heat Lo', 'music-heat-lo', musicHeatLo, HZ, () => defaultMusicRanges.heatLo, hz),
            knob('Heat Hi', 'music-heat-hi', musicHeatHi, HZ, () => defaultMusicRanges.heatHi, hz),
            knob('Eddy Lo', 'music-eddy-lo', musicEddyLo, HZ, () => defaultMusicRanges.eddyLo, hz),
            knob('Eddy Hi', 'music-eddy-hi', musicEddyHi, HZ, () => defaultMusicRanges.eddyHi, hz),
            knob('Kick Lo', 'music-kick-lo', musicKickLo, HZ, () => defaultMusicRanges.kickLo, hz),
            knob('Kick Hi', 'music-kick-hi', musicKickHi, HZ, () => defaultMusicRanges.kickHi, hz)
          ),
        pair('Spectrum', toggle('spectrum', showSpectrum)),
        row('Log', button({ class: 'small', title: 'Save what the lamp heard and did since Listen went on, ten rows a second, as a file', onclick: () => window.dispatchEvent(new Event('lavalamp-music-log')) }, 'Save')),
        ...(GLOOPS_SHOWN
          ? [pair('Gloops', div({ class: soundPending.bindAttr(() => soundPending() ? 'pending' : '') }, toggle('sound', sound))),
              row('Bed', segmented('bed', soundBed, soundBeds))]
          : []),
        helpList(help, [
          ['Sense', 'How loud the music counts as: turn up for a quiet speaker, down for a loud one. The meter shows the heat, eddy and kick ranges, and flashes on the beat.'],
          ['Every', 'Every this many beats a pot fires under the lava and, if there is room, an eddy comes in: 4 is every bar of most songs, 8 every two, 16 a phrase.'],
          ['Floor', 'How much the heat range turns up the floor heat, on top of the Floor knob: at 1x a full signal doubles it.'],
          ['Lift', 'How much the heat range raises Lift, so blobs rise harder on the drop.'],
          ['Eddies', 'How much the eddy range swells the eddies, so each hit shoves the lava.'],
          ['Kick', 'How much the kick range sharpens the Kick, the recoil of necks and skins.'],
          ['Lead', 'With Drop at 0: how many seconds before a beat a pot is lit, so the blob lifts on the beat rather than after it. The lamp learns the beat from the music and predicts the next one; 0 lights the pot as the beat is heard.'],
          ['Drop', 'One pot is kept closed and superheating; on the beat it opens and is blasted, so a hot glob leaves exactly on the beat, and the next pot closes. It opens every Every beats, and on the first kick after a breakdown, when it has charged longest and goes up hottest. 0 lights the pots ahead of the beat instead, by Lead.'],
          ['Boom', 'A deep bass note, one that comes in out of a quiet low end and holds, opens a pot while the song is busy, so a burst of lava goes up with it. Sets how hard it is blasted; 0 is off.'],
          ['Flip', 'The chance a drop turns an eddy\'s spin round on the spot, so the swirl suddenly runs the other way; a deep bass note does it at an eighth of the chance. Each eddy flips once in its life at most. 0 is off.'],
          ['Wobble', 'While a wobble bass is sweeping (the wah wah of dubstep), an eddy comes in on its second to fourth wah, then another every few wahs while it keeps going: more often turned up, 0 is off. As many as Busy eddies allows, and two more.'],
          ['Busy eddies', 'While the song is busy, at least this many eddies; an Eddies setting above it is kept. 0 leaves Eddies as set.'],
          ['Glob', 'A bass hit (a deep note, a beat on the phrase) lifts the lid of its closed, superheated pot for a moment, on the hit and on each beat after, up to six: a train of globs in time with the music. How long the lid lifts each time, so how big each glob is. 0 is off.'],
          ['Activity', 'How much the song\'s sections change the lamp: calm in a breakdown, busy where everything is playing. 0 ignores them.'],
          ['Tempo', 'How much the lamp\'s pace follows the song\'s tempo, against 120 bpm, never more than a quarter slower or a third faster.'],
          ['Pulse', 'The chance a bass hit sends a pressure wave out from an eddy, a ring that pushes the lava out and lets it back.'],
          ['Spawn', 'The chance a bass hit brings in a new eddy, more often the more energetic the music.'],
          ['Spin', 'The chance a hi-hat brings in a spinning eddy, also more often as the music gets energetic.'],
          ['Beat Lo', 'The frequencies the beat is counted in, Lo to Hi: around 40 to 150 Hz is the kick drum.'],
          ['Heat Lo', 'The frequencies that heat the lava, Lo to Hi.'],
          ['Eddy Lo', 'The frequencies that swell the eddies, Lo to Hi.'],
          ['Kick Lo', 'The frequencies that sharpen the Kick, Lo to Hi.'],
          ['Log', 'Saves what the lamp heard and did since Listen went on (activity, beats, surges, pots, drops), ten rows a second, as a file to tune by.'],
          ['Spectrum', 'A strip along the bottom of the screen showing what the lamp hears: frequency up the side, low red to high violet, the four ranges as coloured lines, each sync\'s level along the top with the song\'s activity in violet, a white tick on every beat heard, a grey one on every beat predicted, and a white bar where a pot fires.'],
          ...(GLOOPS_SHOWN ? [['Gloops', 'Sounds made up from the lava as it moves: a bloop where a neck snaps or a blob lands, and a bed that follows how stirred up the lava is.']] : [])
        ])
      ),
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
  )

  tooltips(panel)
  return { element: panel, open, close, meter, setMusicInputs }
}
