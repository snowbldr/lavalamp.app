import { a, button, div, fnstate, input, li, ol, span } from '@srfnstack/fntags'
import { TOUCH_UI, ask, chevron, group, picker, helpList, hint, iconChoice, knob, knobStyle, knobStyles, knobs, notify, pair, row, trio, section, sectionWith, segmented, subgroup, swatch, swatchRow, toggle, tooltips } from './components.js'
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
  takePlaces,
  heatCoolAt,
  heatWarmAt,
  heatHotAt,
  putPlaces,
  soundPending,
  fullscreen,
  fullscreenHow,
  pageFullscreenWorks,
  fromHomeScreen,
  motionOn,
  firefly,
  iceFly,
  dyedFluid,
  staticColors,
  staticColorsBy,
  staticColorsBys,
  staticColorsByNames,
  staticColorsLayered,
  defaultStaticColorsLayered,
  densityMass,
  defaultDensityMass,
  densityHeat,
  defaultDensityHeat,
  densityCling,
  defaultDensityCling,
  staticFlyFade,
  defaultStaticFlyFade,
  layerCenter,
  defaultLayerCenter,
  layerCurve,
  defaultLayerCurve,
  layerBands,
  defaultLayerBands,
  layerReverse,
  streamersInMusic,
  motionInMusic,
  musicFlow,
  defaultMusicFlow,
  musicHeat,
  defaultMusicHeat,
  musicSparkle,
  musicGlow,
  musicFlowEvents,
  musicHeatEvents,
  dyeMode,
  dyeModes,
  dyeModeNames,
  dyeFade,
  defaultDyeFade,
  dyeStamp,
  defaultDyeStamp,
  dyeCurve,
  defaultDyeCurve,
  dyeCut,
  defaultDyeCut,
  dyeGlow,
  defaultDyeGlow,
  soundBed,
  soundBeds,
  music,
  musicPending,
  musicWait,
  musicSource,
  musicSources,
  musicThemeNames,
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
  musicSections,
  defaultMusicSections,
  defaultMusicWobble,
  musicVent,
  defaultMusicVent,
  defaultMusicMotion,
  showSpectrum,
  showFlyTrails,
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
  eddyPullIn,
  defaultEddyPullIn,
  splatPullIn,
  defaultSplatPullIn,
  eddyCurve,
  eddyCurves,
  stiffnessNear,
  stir,
  turbulence,
  wobble,
  showDefaults,
  takeShow,
  putShow,
  takeView,
  putView,
  viewDefaults,
  takeAdvanced,
  putAdvanced,
  advancedBase,
  normColours,
  packColours,
  unpackColours,
  packShow,
  unpackShow,
  packView,
  unpackView,
  cleanAdvanced,
  sharedExtras
} from './settings.js'
import { themeList, confirmReset, sameData } from './themeList.js'
import { homeScreenSteps } from './homeScreen.js'
import { CURRENT, goTo, versions } from '../versions.js'

// The panel's names, each in one place so a rename is one line (Robert: "We should rename color themes to My Colors.
// Music themes should be My effects? (I don't love my effects)... We should have a global themes card, probably near the
// top. I also think we should get all of those top level toggles into a card"; the names were proposed to him).
const THEMES_TITLE = 'Themes' // the whole lamp themes, the first card
const COLORS_LABEL = 'Colors' // what opens the colour card
const MY_COLORS = 'My Colors' // the colour themes, built in and saved
const MY_SHOWS = 'My Shows' // the music themes, Vibes, Calm and the saved ones
const VIEW_TITLE = 'View' // the card of the lamp's own switches
// Every card folded as the panel opens the first time (Robert: "probably we should collapse all groups by default"), and
// each fold remembered in this browser alone, never in a save or a link.
const FOLD_KEY = 'lavalamp.app-panel-folds'
let folds = {}
try { folds = JSON.parse(localStorage.getItem(FOLD_KEY) || '{}') || {} } catch (e) { folds = {} }
const fold = name => {
  const open = fnstate(folds[name] === true)
  open.subscribe(v => { folds[name] = v; try { localStorage.setItem(FOLD_KEY, JSON.stringify(folds)) } catch (e) {} })
  return open
}
// A card that folds by its title: the title row (with whatever sits on it), what shows folded, and the body.
const card = (open, title, { tools = [], before = [], always = [], cls = '' } = {}, ...body) => div({ class: open.bindAttr(() => `sub-panel ${cls}${open() ? '' : ' folded'}`) },
  ...before,
  div({ class: 'sub-title foldable', onclick: e => { if (!e.target.closest('.toggle, .theme-tools')) open(!open()) } }, span({ class: 'card-title' }, title), ...tools, chevron()),
  ...always,
  div({ class: 'sub-body' }, ...body))
// The words for what loading a theme would reset (themeList.js confirmReset), each a setting's name and its value now.
const SETTING_NAMES = {
  musicFlowEvents: 'Flow events', musicHeatEvents: 'Heat events', musicFlow: 'Flow strength', musicHeat: 'Heat strength', musicSparkle: 'Sparkle', musicGlow: 'Glow',
  streamersInMusic: 'Streamers', motionInMusic: 'Motion in music', dyeMode: 'Drawn', dyeFade: 'Fade', dyeStamp: 'Stamp', dyeCurve: 'Streamer curve', dyeCut: 'Tail cut', dyeGlow: 'Streamer glow',
  showFlow: 'Flow', motionOn: 'Motion', firefly: 'Firefly', iceFly: 'Ice fly', dyedFluid: 'Streamers', staticColors: 'Static colors', staticColorsBy: 'Dealt by', staticColorsLayered: 'Density', layerCenter: 'Center', layerCurve: 'Layer curve', layerBands: 'Bands', layerReverse: 'Reverse', densityMass: 'Mass', densityHeat: 'Heat take', densityCling: 'Cling', staticFlyFade: 'Fly fade',
  stir: 'Stir', turbulence: 'Turb', drifters: 'Eddies', pace: 'Pace', eddySpeed: 'Speed', eddyFalloff: 'Fall off', eddyCurve: 'Curve', eddyPullIn: 'Rim pull in', splatPullIn: 'Splat pull in',
  conduction: 'Conduct', maxTemp: 'Max Temp', heatSpots: 'Period', elementHeat: 'Heat', elementLife: 'Duration', elementLifeScale: 'Big pot', elementRate: 'Pulses', elementCore: 'Core', floorHeat: 'Floor', floorGlow: 'Glow',
  particleCount: 'Count', interactionRadius: 'Radius', cupDepth: 'Bottles', reserve: 'Reserve', pull: 'Pull', stiffnessNear: 'Near', gravityStrength: 'Gravity', lift: 'Lift',
  wobble: 'Wobble', wobbleKick: 'Kick', wobbleMax: 'Cap', viscosity: 'Viscosity', settle: 'Settle', reach: 'Reach', skin: 'Skin', wall: 'Wall',
  particleSize: 'Size', smooth: 'Smooth', blend: 'Blend', autoPixels: 'Auto Pixels', targetFps: 'Target', showHeater: 'Heater', showCups: 'Reservoirs', showFlyTrails: 'Fly trails', showSpectrum: 'Spectrum',
  musicSensitivity: 'Sense', musicEvery: 'Every', musicFloor: 'Music Floor', musicLift: 'Music Lift', musicTurb: 'Music Eddies', musicKick: 'Music Kick', musicLead: 'Lead', musicActivity: 'Activity', musicDrop: 'Drop', musicBoom: 'Boom', musicVent: 'Vent',
  musicTempo: 'Tempo', musicPulse: 'Pulse', musicSpawn: 'Spawn', musicSpin: 'Spin', musicBusyEddies: 'Busy eddies', musicFlip: 'Flip', musicWobble: 'Music Wobble', musicSections: 'Sections',
  musicBeatLo: 'Beat Lo', musicBeatHi: 'Beat Hi', musicHeatLo: 'Heat Lo', musicHeatHi: 'Heat Hi', musicEddyLo: 'Eddy Lo', musicEddyHi: 'Eddy Hi', musicKickLo: 'Kick Lo', musicKickHi: 'Kick Hi'
}
const settingWords = (k, v) => {
  const value = typeof v === 'boolean' ? (v ? 'on' : 'off')
    : k === 'musicFlow' || k === 'musicHeat' ? `${Number(v).toFixed(1)}x`
      : k === 'dyeFade' ? `${Math.round(v * 100)}%/s`
        : k === 'dyeCut' ? `${Number(v).toFixed(2)}/s`
          : k === 'dyeGlow' ? `${Number(v).toFixed(2)}x`
        : k === 'dyeMode' ? dyeModeNames[v] || v
        : k === 'staticColorsBy' ? staticColorsByNames[v] || v
        : k === 'layerBands' ? bandsWords(v)
          : typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v)
  return `${SETTING_NAMES[k] || k} ${value}`
}
const near = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)) : a === b
// What differs between now and a theme's values, over the given keys, as words for now's.
const differences = (now, target, keys) => keys.filter(k => !near(now[k], target[k])).map(k => settingWords(k, now[k]))
const SHOW_KEYS = Object.keys(showDefaults()).filter(k => k !== 'musicTheme') // the pick itself is the theme, not a change
const VIEW_KEYS = Object.keys(viewDefaults())
const COLOUR_NAMES = { heatCold: 'Cold', heatCool: 'Cool', heatWarm: 'Warm', heatHot: 'Hot', heatPeak: 'Peak', bgColor: 'Background', flowSlow: 'Slow arrows', flowFast: 'Fast arrows', heatCoolAt: 'Cool\'s place', heatWarmAt: 'Warm\'s place', heatHotAt: 'Hot\'s place' }
const colourDifferences = (now, target) => { const a = normColours(now), b = normColours(target); return Object.keys(COLOUR_NAMES).filter(k => !sameData(a[k], b[k])).map(k => COLOUR_NAMES[k]) }
const advancedDifferences = (now, target) => { const base = advancedBase(), a = { ...base, ...now }, b = { ...base, ...target }; return differences(a, b, Object.keys(base)) }
const wholeDifferences = (now, t) => [
  ...(colourDifferences(now.colors, t.colors).length ? [COLORS_LABEL] : []),
  ...differences(now.show, t.show, SHOW_KEYS),
  ...differences(now.view, t.view, VIEW_KEYS.filter(k => !SHOW_KEYS.includes(k))),
  ...advancedDifferences(now.advanced || {}, t.advanced || {})
]

// The Firefly switch's title and help line (settings.js firefly).
const FIREFLY_ABOUT = 'An unseen firefly loops through the lava all the time, leaving tiny bright sparks wherever it passes.'
// The Ice fly switch's (settings.js iceFly), the firefly's cold twin.
const ICE_FLY_ABOUT = 'The firefly\'s cold twin: an unseen ice fly loops round the hottest lava all the time, leaving tiny cold sparks that cool it.'
// The Streamers switch's lines (settings.js dyedFluid, render/dye.js). Shown as Streamers (Robert, on first seeing it: "oh shit,
// this is insane looking. Let's change it from dyed fluid to 'ghosting'", then "oh, no, not ghosting, streamers. yeah, like when
// people are on drugs lol"); the code and stored keys keep the dye names.
const DYE_ABOUT = 'Every bit of lava leaves a streamer of its colour in the water, carried by the flow, so you can see the plumes and wakes. It only changes the look.'
const STREAMERS_MUSIC_ABOUT = 'Streamers come on by themselves whenever Music plays a theme; off, only the Streamers switch shows them.'
// Motion in music (settings.js motionInMusic; Robert: "music mode should turn off motion by default in the lamp").
const MOTION_MUSIC_ABOUT = 'On, tilting and shaking the device moves the lava while music plays, as it does without music. Off, the lava ignores the device during music.'
// The Music card's Effects (settings.js musicFlow, musicHeat, musicSparkle, musicGlow; Robert: "I had two mega sliders I want
// for music, under a section titled 'effects', flow strength and heat strength. I think we could also add checkboxes for
// turning off global sparkle and glow.").
const FLOW_STRENGTH_ABOUT = 'How hard the music moves the lava: 1x is normal, 0 moves nothing, 2x twice as hard.'
const HEAT_STRENGTH_ABOUT = 'How much the music heats and cools the lava: 1x is normal, 0 none, 2x twice as much.'
const SPARKLE_MUSIC_ABOUT = 'The sparkle on every beat. Off, only the theme\'s own sparkle effects on hits still flash.'
const GLOW_MUSIC_ABOUT = 'The glow that follows the music, and the warmth it gives. Off, only the theme\'s own glow pulses still light the lava.'
// Flow events and Heat events (settings.js musicFlowEvents, musicHeatEvents; Robert: "we should allow disabling heat or flow
// events, some people may not like that so much").
const FLOW_EVENTS_ABOUT = 'Whether the music\'s hits stir the lava with eddies, pushes, splats and ring waves.'
const HEAT_EVENTS_ABOUT = 'Whether the music\'s hits heat and cool the lava with pot blasts, sparkles and cold bursts. Off, only the beat sparkle and the glow still warm it.'
// The Effects fold's tabs (Robert: "we should make heat and flow two sub cards with 50% width tab header, one says 'Flow'
// one says 'Heat'. Each has an enabled toggle and strength... Oh, we should also move streamers as a tab, so 3 tabs"):
// the open one remembered in this browser alone, not in a save.
const EFFECT_TABS = ['flow', 'heat', 'streamers']
const EFFECT_TAB_NAMES = { flow: 'Flow', heat: 'Heat', streamers: 'Streamers' }
const EFFECT_TAB_KEY = 'lavalamp.app-music-effects-tab'
const DYE_MODE_ABOUT = 'Where the streamers are drawn: Under the lava, glowing in the water, Over it as faint smoke, or Alone with the lava hidden.'
const DYE_FADE_ABOUT = 'How fast the streamers fade: low leaves long trails, high keeps only the freshest.'
const DYE_STAMP_ABOUT = 'How strongly each bit of lava leaves its streamer as it passes.'
const DYE_CURVE_ABOUT = 'How much faster a streamer\'s faint tail fades than its bright head. 0 fades it all alike; higher keeps a strong head with a shorter tail.'
const DYE_CUT_ABOUT = 'Trims the faint ends of the streamers so they stop cleanly instead of trailing on. 0 trims nothing.'
const DYE_GLOW_ABOUT = 'How brightly the streamers are drawn. Above 1x the brightest parts soften towards white instead of clipping flat.'
// Static colors (settings.js staticColors, render/staticColors.js; Robert: "could be a view setting, 'static colors'").
const STATIC_ABOUT = 'Each bit of lava keeps one colour for life instead of showing its heat. Each colour has its own weight, cold heaviest, so the lava sorts into bands of colour inside each blob. Fine tuning is under Advanced, Liquid, Static colors.'
const STATIC_BY_ABOUT = 'How the colours are handed out when Static colors comes on: by Height, cold at the bottom to hot at the top; Across, left to right; or at Random.'
// Density, once Layered (settings.js staticColorsLayered, simulation.js layerScale; Robert: "vary the density of the particles on a
// gradient that matches the color gradient", then "we probably need some advanced tuning knobs in the settings for
// particle density where can fiddle with the relationship to the gradient to find jsut the right settings").
const LAYERED_ABOUT = 'How much heavier the cold colours are than the hot ones, so cold lava settles into layers of colour while heat still lifts it. 2 is the default and the most; 0 makes every colour weigh the same.'
// Density physics (settings.js densityMass; Robert: "also I wanted controls for controlling the phsyics of the density").
const DENSITY_MASS_ABOUT = 'How much the heavy colours also resist being pushed, so they shove the light ones aside. 0 turns it off.'
const DENSITY_HEAT_ABOUT = 'How much slower the heavy colours heat and cool, so they linger on the floor before rising and stay hot longer once up. 0 turns it off.'
const DENSITY_CLING_ABOUT = 'How much colours far apart on the gradient let go of each other, so each colour gathers into its own blobs, like oil and water. 0 turns it off.'
const LAYER_CENTER_ABOUT = 'Which colour weighs the same as ordinary lava; colours colder than it are heavier, warmer ones lighter. Lower makes most of the lava lighter, higher most of it heavier; 0.5 is the middle.'
const LAYER_CURVE_ABOUT = 'Where along the colours the weight changes most: 1 evenly, over 1 mostly among the hot colours, under 1 mostly among the cold.'
const LAYER_BANDS_ABOUT = 'Smooth gives every colour its own weight; 2 or more groups the colours into that many weights, for sharper layers.'
// Fly fade (settings.js staticFlyFade, render/staticColors.js fly; Robert: "we hsoul dhave the flys change the density
// instead of heat when static color is enabled"; the music show's flies too: "music show flies should get the same treatment yes").
const STATIC_FLY_FADE_ABOUT = 'With Static colors on, the Firefly and Ice fly (the switches and the music show\'s) change the colour of the lava they touch instead of its heat: lighter, so it rises, or darker, so it sinks. How many seconds that lava takes to fade back to its own colour.'
const LAYER_REVERSE_ABOUT = 'Makes the cold colours the lightest instead of the heaviest.'
const bandsWords = v => v >= 2 ? String(Math.round(v)) : 'Smooth'
// The streamers' Drawn, Fade and Stamp, shown under whichever switch turns the streamers on: the lamp's own Streamers
// switch, and the Music card's Streamers (Robert: "oh we lost the streamer controls, can we have that back?", after the
// music's switches moved to the Music card and the controls stayed hidden under the lamp's switch, off in music).
const dyeControls = (shown, id) => div({ class: 'dye-controls', style: { display: shown.bindStyle(() => shown() ? 'block' : 'none') } },
  Object.assign(row('Drawn', segmented(id + '-mode', dyeMode, dyeModes, dyeModeNames)), { title: DYE_MODE_ABOUT }),
  knobs(
    Object.assign(knob('Fade', id + '-fade', dyeFade, { min: 0.05, max: 0.95, step: 0.05, slider: true }, () => defaultDyeFade, v => `${Math.round(v * 100)}%/s`), { title: DYE_FADE_ABOUT }),
    Object.assign(knob('Stamp', id + '-stamp', dyeStamp, { min: 0.05, max: 1, step: 0.05, slider: true }, () => defaultDyeStamp, fixed(2)), { title: DYE_STAMP_ABOUT }),
    Object.assign(knob('Curve', id + '-curve', dyeCurve, { min: 0, max: 3, step: 0.05, slider: true }, () => defaultDyeCurve, fixed(2)), { title: DYE_CURVE_ABOUT }),
    Object.assign(knob('Tail cut', id + '-cut', dyeCut, { min: 0, max: 1, step: 0.01, slider: true }, () => defaultDyeCut, v => `${Number(v).toFixed(2)}/s`), { title: DYE_CUT_ABOUT }),
    Object.assign(knob('Glow', id + '-glow', dyeGlow, { min: 0.5, max: 5, step: 0.05, slider: true }, () => defaultDyeGlow, v => `${Number(v).toFixed(2)}x`), { title: DYE_GLOW_ABOUT })
  )
)

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
const times = v => `${Number(v).toFixed(2)}x`
// The frequency range knobs, 20 Hz to 12 kHz.
const HZ = { min: 20, max: 12000, step: 10 }
const hz = v => v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${v} Hz`

export function createSettingsPanel () {
  let panel
  // Advanced and its groups, all folded by default.
  const advancedOpen = fold('advanced')
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
  const musicOpen = fold('music')
  const themesOpen = fold('themes')
  const coloursOpen = fold('colors')
  const touchOpen = fold('touch')
  const viewOpen = fold('view')
  const effectsOpen = fnstate(false) // the Music card's Effects fold, closed as the card opens
  const staticDetailOpen = fnstate(false) // Advanced, Liquid: the Static colors fold, closed as the panel opens
  let tabWas = null
  try { tabWas = localStorage.getItem(EFFECT_TAB_KEY) } catch (e) {}
  const effectsTab = fnstate(EFFECT_TABS.includes(tabWas) ? tabWas : 'flow')
  effectsTab.subscribe(t => { try { localStorage.setItem(EFFECT_TAB_KEY, t) } catch (e) {} })
  // Music not working? (Robert: "a clickable link like hear every app, that opens help for if the music sync is not
  // working... explain the sound detector... A page explaining how the chrome music sharing with system works is probably
  // good, that little checkbox is super easy to miss"). Inline under the link, as the loopback steps are. The facts about
  // Chrome's dialog are from Google's own help (2026-11): a tab shares its sound with "Also share tab audio"; a window
  // or the entire screen with "Also share system audio", on macOS 14.2 or newer with a recent Chrome.
  const musicHelp = fnstate(false)
  const helpLink = (href, text) => a({ href, target: '_blank', rel: 'noopener', class: 'music-link' }, text)
  const helpHead = text => div({ class: 'music-help-head' }, text)
  const shareHelp = div({ class: 'music-help-share' },
    helpHead('Chrome\'s share dialog'),
    div({ class: 'music-help-flag', style: { display: musicWait.bindStyle(() => musicWait() === 'noaudio' ? 'block' : 'none') } }, 'The share had no sound: turn on Also share tab audio (or Also share system audio) at the bottom of the dialog, then Try again.'),
    div('Chrome Tab is the surest pick: choose the tab playing the music (Spotify or YouTube in the browser) and make sure Also share tab audio, at the bottom of the dialog, is on.'),
    div('Entire Screen hears every app, but only with Also share system audio switched on. That switch sits small at the bottom left of the dialog and is easy to miss. On a Mac it needs macOS 14.2 or newer and an up to date Chrome, and the Mac asks you once to allow Chrome under Screen & System Audio Recording.'),
    div('Window gives sound only in a recent Chrome with Also share system audio on, under the same conditions; older versions share a window with no sound at all. Pick a tab or the screen instead.'),
    div('On an older Mac, use a Chrome tab, or the Hear every app route above, which needs no share at all.'),
    div('Stopping the share (the browser\'s Stop sharing bar) leaves Music on and waiting, with a Try again.')
  )
  const musicHelpBody = div({ class: 'music-note music-help', style: { display: musicHelp.bindStyle(() => musicHelp() ? 'block' : 'none') } },
    helpHead('The meter'),
    div('The three bars at the top of this card are what the lamp hears: the bass, the middle and the highs, with a dot that flashes on the beat. If they stay still while music plays, the lamp is getting no sound at all, and the fix is in the Source and the browser\'s settings below.'),
    helpHead('Mic'),
    div('The lamp listens through a microphone, so play the music out loud nearby and turn it up. Allow the microphone when the browser asks. If you said no, click the icon at the left of the address bar, allow the microphone and Try again.' + (TOUCH_UI ? '' : ' With more than one microphone or input, choose the right one under Input once Music is on.')),
    ...(TOUCH_UI ? [] : [
      helpHead('System'),
      div('The lamp hears what this computer plays, through the browser\'s screen share dialog. Only the sound is used.'),
      helpHead('File'),
      div('Pick a song file and the page plays it and hears it exactly. Nothing is uploaded. The song stays in this browser only, so on another computer or browser, or from a shared link, pick it again.'),
      shareHelp,
      helpHead('Firefox and Safari'),
      div('They share no sound with a screen share, so System hears nothing there. Use Mic or File.')
    ]),
    helpHead('More help'),
    div(helpLink('https://support.google.com/chrome/answer/2693767?hl=en', 'Use your microphone in Chrome')),
    ...(TOUCH_UI ? [] : [
      div(helpLink('https://support.google.com/meet/answer/9308856?hl=en', 'Sharing a tab or screen with sound (Google)')),
      div(helpLink('https://support.apple.com/guide/mac-help/control-access-to-the-microphone-on-mac-mchla1b1e1fe/mac', 'Mac: microphone access')),
      div(helpLink('https://support.apple.com/guide/mac-help/control-access-screen-system-audio-recording-mchld6aa7d23/mac', 'Mac: Screen & System Audio Recording')),
      div(helpLink('https://support.microsoft.com/en-us/windows/fix-microphone-problems-5f230348-106d-bfa4-1db5-336f35576011', 'Windows: fix microphone problems')),
      div(helpLink('https://support.mozilla.org/en-US/kb/how-manage-your-camera-and-microphone-permissions', 'Firefox: microphone permissions')),
      div('On a Mac, ', button({ class: 'music-help-inline', onclick: () => loopbackHelp(true) }, 'Hear every app'), ' sets the lamp up to hear everything with no share dialog.')
    ])
  )
  // The prompt while Music is on and hears nothing (settings.js musicWait): a strip over the lamp, bottom centre like the
  // version banner, and the same words in the Music card. Waiting for a click, a click anywhere starts it (app.js); after
  // a failure, Try again (a click, which the share dialog and the microphone want) asks once more. The cross turns Music
  // off. Hidden while the panel is open, where the card says it.
  const panelShown = fnstate(false)
  const retry = () => window.dispatchEvent(new CustomEvent('lavalamp-music-retry'))
  const openHelp = (at) => {
    musicOpen(true)
    musicHelp(true)
    if (!panel.isConnected) open()
    if (at) setTimeout(() => at.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50)
  }
  const TAP = TOUCH_UI ? 'Tap' : 'Click'
  const waitWords = () => {
    const w = musicWait()
    const file = musicSource() === 'file'
    if (w === 'tap') return file && !musicFileName() ? 'Music is on with a song file: pick the song again.' : file ? `${TAP} anywhere to play ${musicFileName()} for the music sync.` : `${TAP} anywhere to start the music sync.`
    return {
      file: 'Music is on with a song file: pick the song again.',
      cancelled: 'The share was closed, so the music sync is waiting.',
      noaudio: 'The share had no sound: turn on Also share tab audio.',
      ended: 'Sharing stopped, so the music sync is waiting.',
      denied: 'The microphone is blocked for this page.',
      blocked: 'This computer is not letting the browser share its screen.',
      nodevice: 'No microphone or audio input was found.',
      unsupported: 'This browser cannot share its sound: choose Mic.',
      gesture: `${TAP} anywhere to start the music sync.`
    }[w] || 'The music sync could not start.'
  }
  const waitButtons = () => {
    const w = musicWait()
    const pick = musicSource() === 'file' && (w === 'file' || (w === 'tap' && !musicFileName()))
    const out = []
    if (pick) out.push(button({ class: 'music-prompt-button music-tap-skip', onclick: () => songPicker.click() }, 'Pick song'))
    else if (w !== 'tap' && w !== 'unsupported') out.push(button({ class: 'music-prompt-button primary music-tap-skip', onclick: retry }, 'Try again'))
    if (w !== 'tap' && !pick) out.push(button({ class: 'music-prompt-button music-tap-skip', onclick: () => openHelp(w === 'noaudio' || w === 'cancelled' || w === 'ended' || w === 'blocked' ? shareHelp : null) }, 'Help'))
    return out
  }
  const promptText = span({ class: 'music-prompt-text' })
  const promptButtons = span({ class: 'music-prompt-buttons' })
  const cardText = span()
  const cardButtons = span({ class: 'music-prompt-buttons' })
  const musicPrompt = div({ class: 'music-prompt', role: 'status', style: { display: 'none' } },
    promptText, promptButtons,
    button({ class: 'version-banner-close music-tap-skip', title: 'Turn Music off', 'aria-label': 'Turn Music off', onclick: () => music(false) }, '×'))
  const musicWaitNote = div({ class: 'music-note music-wait', style: { display: 'none' } }, cardText, cardButtons)
  const paintWait = () => {
    const w = music() ? musicWait() : ''
    musicPrompt.style.display = w && !panelShown() ? 'flex' : 'none'
    musicWaitNote.style.display = w ? 'flex' : 'none'
    if (!w) return
    promptText.textContent = cardText.textContent = waitWords()
    promptButtons.replaceChildren(...waitButtons())
    cardButtons.replaceChildren(...waitButtons())
  }
  for (const st of [music, musicWait, musicSource, musicFileName, panelShown]) st.subscribe(paintWait)
  // A share with no sound opens the help at the share dialog (Robert: "I do also wonder if we could trigger it to be
  // enabled after they start the share instead of dying").
  // A moment late, so the click that started it (a click on the lamp closes the panel) has landed first.
  musicWait.subscribe(w => { if (w === 'noaudio') setTimeout(() => { if (musicWait() === 'noaudio') openHelp(shareHelp) }, 400) })
  const effectTab = (tab, ...body) => div({ class: 'effect-tab', style: { display: effectsTab.bindStyle(() => effectsTab() === tab ? 'block' : 'none') } }, ...body)
  // The audio inputs, filled from the browser (names only appear once the microphone has been
  // allowed, so the list is asked for again when listening starts and when a device comes or goes).
  const inputSelect = document.createElement('select')
  inputSelect.className = 'music-select'
  // Shown for the microphone only once there is a named input to choose (Robert: "Why does the input drop down exist if
  // chrome is going ot ask for it anyway?"): before the microphone is allowed, a desktop browser
  // gives a single nameless input and the list held only Default input.
  let inputs = null
  const showInput = fnstate(false)
  const fillInputs = async () => {
    if (!inputs) return
    const list = (await inputs.list()).filter(d => d.id && d.id !== 'default')
    const current = inputs.get()
    showInput(musicSource() === 'mic' && list.length > 0)
    inputSelect.replaceChildren(...[{ id: '', label: 'Default input' }, ...list].map(d => { const o = document.createElement('option'); o.value = d.id; o.textContent = d.label; o.selected = d.id === current; return o }))
  }
  inputSelect.addEventListener('change', () => inputs && inputs.set(inputSelect.value))
  const setMusicInputs = x => { inputs = x; fillInputs(); if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', fillInputs) }
  music.subscribe(on => { if (on) setTimeout(fillInputs, 800) })
  musicSource.subscribe(fillInputs)

  // Every version of the lamp is kept and can be opened (Robert: "the ability to load old
  // versions of the lava lamp"); a newer one than this, when there is one, is offered first as
  // an upgrade that maps these settings onto it (src/versions.js). Filled once the manifest loads.
  const versionRow = div({ class: 'panel-note' }, `Version ${CURRENT}`)
  // The build that is deployed (Robert: "I can't tell if it's deployed, let's add a version viewable
  // after expanding advanced"): the deploy writes the commit and its date into version.txt (the
  // snowbuilt lavalamp.app Dockerfile); served from a checkout there is none, so it says local.
  const buildRow = div({ class: 'panel-note' }, 'Build: local')
  fetch('version.txt', { cache: 'no-store' }).then(r => r.ok ? r.text() : null).then(text => { if (text && text.trim() && !/<html/i.test(text)) buildRow.textContent = `Build: ${text.trim()}` }).catch(() => {})
  versions().then(list => {
    const newer = list.filter(v => Number(v.version) > Number(CURRENT))
    const older = list.filter(v => Number(v.version) < Number(CURRENT))
    // As chips in the panel's look (Robert: "version selector looks bad"): this version, then the
    // newer ones to upgrade to, then the older ones to open.
    versionRow.className = 'version-row'
    versionRow.replaceChildren(
      div({ class: 'version-now' }, `Version ${CURRENT}${newer.length ? '' : ', the newest'}`),
      ...newer.map(v => button({ class: 'version-chip primary', title: v.description, onclick: async () => { if (await ask(`Upgrade to ${v.label}? These settings are mapped onto it; this version's save is kept.`, { yes: 'Upgrade' })) window.location.href = `${v.path}&upgrade=${CURRENT}&from=${encodeURIComponent(btoa(JSON.stringify(getSettings())))}` } }, `Upgrade to ${v.label}`)),
      ...(older.length ? [div({ class: 'version-chips' }, span({ class: 'version-older' }, 'Older'), ...older.map(v => button({ class: 'version-chip', title: `${v.date}: ${v.description}`, onclick: () => goTo(v.version) }, v.label)))] : [])
    )
  })
  const open = () => { document.body.append(panel); panelShown(true) }
  const close = () => { stopEditing(); panel.remove(); panelShown(false) }

  // On a touch screen a link goes to the phone's own share sheet (Robert: "can we make the share
  // button open the share dialog on mobile?"); elsewhere, or where there is none, it is copied.
  // Closing the sheet without sharing does nothing.
  const sendLink = (url, title, copied) => {
    if (navigator.share && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      return navigator.share({ title, url }).catch(err => { if (err && err.name !== 'AbortError') copy() })
    }
    return copy()
    function copy () {
      return navigator.clipboard.writeText(url).then(() => notify(copied), err => { notify('Could not copy the link'); console.error(err) })
    }
  }
  const copyShareLink = () => sendLink(shareLink(themeExtras()), 'My lava lamp', 'Link copied to clipboard')

  const resetDefaults = () => {
    ask('Reset everything to the defaults and remove the saved settings? Your saved themes stay.', { yes: 'Reset', danger: true }).then(yes => { if (yes) resetAndReload() })
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

  // The bar is the heat colours, live (Robert: "we should get rid of the preview and save button
  // actually"): five dots, Cold and Peak at the ends and Cool, Warm and Hot between (Robert: "we
  // could combine the 5 dots with the gradient selector with the 3 pins"). A click on a dot opens
  // its picker; the three middle ones are pins that drag along the bar, setting where their colour
  // sits along the heat (settings.js heatCoolAt), each kept GAP_PX from its neighbours so two can
  // always be taken apart with a finger (Robert: "the sliding toggles on the gradient shouldn't be
  // allowed to overlap"), and pushing them along when it meets them. Everything goes straight onto the lamp.
  // Touching but never overlapping: a pin's width apart from the next, and an end circle's edge plus
  // half a pin from each end (Robert: "the sliders get too close to the end color buttons and make it
  // hard to select. I think it's probably ok if it goes all the way touching but not overlapping, and
  // same with other sliders"; they were 30 px apart and could sit over the end circles).
  const GAP_PX = 14 // panel.css .gradient-dot.pin width
  const END_PX = 39 // the end circle's far edge (10 + 22) plus half a pin (7)
  const PUSH_PX = 12 // how far past a neighbour a drag goes before it pushes it
  const STOP_NAMES = ['Cold', 'Cool', 'Warm', 'Hot', 'Peak']
  const liveStops = [heatCold, heatCool, heatWarm, heatHot, heatPeak]
  const livePlaces = [heatCoolAt, heatWarmAt, heatHotAt]
  const STOPS = ['heatCold', 'heatCool', 'heatWarm', 'heatHot', 'heatPeak']
  const css = c => `rgb(${c.r}, ${c.g}, ${c.b})`
  const bar = div({ class: 'gradient-bar' })
  const dots = STOP_NAMES.map((name, k) => {
    const pin = k > 0 && k < 4
    const dot = div({ class: pin ? 'swatch gradient-dot pin' : 'swatch gradient-dot end', role: 'button', tabindex: 0, 'aria-label': `${name} colour`, title: pin ? `${name}: click for its colour, drag to move it` : `${name}: click for its colour` })
    dot.swatchTitle = name
    dot.swatchState = liveStops[k]
    // A pin pushes the ones it meets along, each kept a gap apart, all of them stopping at the
    // ends (Robert: "sliding a stacked gradient slider should push other sliders out of the way"),
    // but only once the drag has gone PUSH_PX past the neighbour, so a slip does not move it ("like,
    // after some force so it doesn't happen on accident"); until then it stops there.
    const place = (u, drag = {}) => {
      const p = livePlaces.map(s => s())
      const width = Math.max(1, bar.getBoundingClientRect().width)
      const gap = Math.min(0.24, GAP_PX / width)
      const end = Math.min(0.3, END_PX / width)
      const force = PUSH_PX / width
      const i = k - 1
      let x = u
      const hi = i < 2 ? p[i + 1] - gap : Infinity
      const lo = i > 0 ? p[i - 1] + gap : -Infinity
      if (x > hi) {
        if (!drag.up && x - hi < force) x = hi
        else { drag.up = true; x = Math.max(hi, x - force) }
      } else drag.up = false
      if (x < lo) {
        if (!drag.down && lo - x < force) x = lo
        else { drag.down = true; x = Math.min(lo, x + force) }
      } else drag.down = false
      // The ends last: applied before the push's lag, a pushed row stopped PUSH_PX short of the end
      // (Robert: "I can't push the last one closer by pushing the furthest one").
      p[i] = Math.max(end + gap * i, Math.min(1 - end - gap * (2 - i), x))
      for (let j = i + 1; j < 3; j++) p[j] = Math.max(p[j], p[j - 1] + gap)
      for (let j = i - 1; j >= 0; j--) p[j] = Math.min(p[j], p[j + 1] - gap)
      p.forEach((v, j) => { const r = Math.round(v * 1000) / 1000; if (r !== livePlaces[j]()) livePlaces[j](r) })
    }
    dot.addEventListener('pointerdown', e => {
      e.preventDefault()
      const x0 = e.clientX
      const drag = {}
      let moved = false
      dot.setPointerCapture(e.pointerId)
      const move = ev => {
        if (!pin) return
        if (!moved && Math.abs(ev.clientX - x0) < 4) return
        moved = true
        const r = bar.getBoundingClientRect()
        place((ev.clientX - r.left) / r.width, drag)
      }
      const up = () => {
        dot.removeEventListener('pointermove', move); dot.removeEventListener('pointerup', up); dot.removeEventListener('pointercancel', up)
        if (!moved) picker(dot)
      }
      dot.addEventListener('pointermove', move)
      dot.addEventListener('pointerup', up)
      dot.addEventListener('pointercancel', up)
    })
    dot.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { picker(dot); e.preventDefault(); return }
      if (!pin) return
      const step = e.shiftKey ? 0.05 : 0.01
      if (e.key === 'ArrowLeft') { place(livePlaces[k - 1]() - step); e.preventDefault() } else if (e.key === 'ArrowRight') { place(livePlaces[k - 1]() + step); e.preventDefault() }
    })
    bar.append(dot)
    return dot
  })
  const showBar = () => {
    const at = [0, ...livePlaces.map(s => s()), 1]
    dots.forEach((dot, k) => { dot.style.left = `${at[k] * 100}%`; dot.style.background = css(liveStops[k]()) })
    // The bar as the lamp draws it: straight blends between the five at their places.
    bar.style.background = `linear-gradient(90deg, ${dots.map((d, k) => `${css(liveStops[k]())} ${(at[k] * 100).toFixed(1)}%`).join(', ')})`
  }
  for (const state of [...liveStops, ...livePlaces]) state.subscribe(showBar)
  showBar()
  // Two labels only, the ends (Robert: "we only really also need two labels there, cold and hot.
  // Everything in between is just implicit from the gradient").
  // The background as a rounded button between the two labels, under the bar (Robert: "We should
  // move background to a rounded rectangle button underneath the gradient and between the cold and
  // hot labels"); before, a swatch on its own row and then one in a row above the bar.
  const backButton = swatch('Background', 'bgColor', bgColor)
  backButton.classList.add('back-button')
  const gradientPending = div({ class: 'gradient-pending' }, bar, div({ class: 'gradient-labels' }, span('Cold'), backButton, span('Hot')))

  // Themes are starting points (Robert: "they click an existing theme as a starting point or load
  // the default one on start up. They drag the gradient, change colors. then if they want to save
  // it, they click add theme and create a new theme"). A click loads one onto the lamp; if the
  // colours have changed since the last theme was loaded or saved (or since the page opened), it
  // asks first (Robert: "IF they have changes from the theme that was loaded, require an r u sure
  // when they click another theme"). The six built in ones are plain buttons (Robert: "those
  // should remain the 6 gradient buttons we had before"); a saved one has a pencil, which loads it
  // (asking the same) and turns its tile into a name field and a save button that keeps the
  // colours as they are then under that name, and a cross. The plus saves the colours as a new one.
  const allColours = { heatCold, heatCool, heatWarm, heatHot, heatPeak, bgColor, flowSlow, flowFast }
  const takeColours = () => { const out = takePlaces(); for (const [key, state] of Object.entries(allColours)) out[key] = { ...state() }; return out }
  const putColours = colours => { for (const [key, state] of Object.entries(allColours)) if (colours[key]) state({ ...colours[key] }); putPlaces(colours) }
  const sameColours = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  let loaded = takeColours() // the colours as of the last theme loaded or saved
  let loadedTheme = null
  let editing = null // { theme, field }
  let afterColours = () => {} // the Themes card's match, once it exists
  // Deleting: the trash by My themes, then the theme, then a check (Robert: "theme delete button
  // doesn't work for mobile... maybe a trash can button next to 'my themes', you click it, then
  // click the theme you want to delete, then an r u sure"). The trash again, or any other press,
  // leaves it.
  let deleting = false
  const trash = button({ class: 'theme-trash', title: 'Delete a theme: press this, then the theme', 'aria-label': 'Delete a theme', onclick: () => { stopEditing(); sharing = false; deleting = !deleting; fillThemes() } })
  // Sharing, the same way (Robert: "a share button next to the trash would be good. I like the
  // paper airplane icon for that one"): the plane, then a saved theme, and a link to it is copied.
  // The link carries that theme alone (?theme=, its colours, places and name); opening it asks to
  // add it to the opener's themes, and nothing else of theirs changes.
  let sharing = false
  const plane = button({ class: 'theme-trash theme-share', title: 'Share a theme: press this, then the theme', 'aria-label': 'Share a theme', onclick: () => { stopEditing(); deleting = false; sharing = !sharing; fillThemes() } })
  plane.innerHTML = ICON('<path d="M22 3L10 14"/><path d="M22 3l-7 18-5-7-7-5 19-6z"/>')
  const THEME_KEYS = ['heatCold', 'heatCool', 'heatWarm', 'heatHot', 'heatPeak', 'bgColor', 'flowSlow', 'flowFast', 'heatCoolAt', 'heatWarmAt', 'heatHotAt']
  const themeLink = theme => {
    // Short: colours as six hex digits, places to three decimals.
    const hex = c => [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
    const out = { name: theme.name }
    for (const k of THEME_KEYS) if (theme[k] !== undefined) out[k] = k.endsWith('At') ? Math.round(theme[k] * 1000) / 1000 : hex(theme[k])
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(out)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    return `${window.location.origin}${window.location.pathname}?theme=${code}`
  }
  // A show's or a whole theme's link: ?show= or ?lamp=, its data as base64url JSON, the name as n.
  const listLink = (param, data) => `${window.location.origin}${window.location.pathname}?${param}=${btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
  const readListLink = param => {
    const code = new URLSearchParams(window.location.search).get(param)
    if (!code) return null
    const url = new URL(window.location.href)
    url.searchParams.delete(param)
    history.replaceState(null, '', url.pathname + url.search + url.hash)
    try { const o = JSON.parse(decodeURIComponent(escape(atob(code.replace(/-/g, '+').replace(/_/g, '/'))))); return o && typeof o === 'object' ? o : null } catch (e) { return null }
  }
  const readThemeLink = () => {
    const code = new URLSearchParams(window.location.search).get('theme')
    if (!code) return null
    try {
      const t = JSON.parse(decodeURIComponent(escape(atob(code.replace(/-/g, '+').replace(/_/g, '/')))))
      // Colours as hex (the short form) or as { r, g, b } (the first links).
      for (const k of THEME_KEYS) if (typeof t[k] === 'string' && /^[0-9a-f]{6}$/i.test(t[k])) t[k] = { r: parseInt(t[k].slice(0, 2), 16), g: parseInt(t[k].slice(2, 4), 16), b: parseInt(t[k].slice(4, 6), 16) }
      const colour = c => c && [c.r, c.g, c.b].every(v => Number.isFinite(v) && v >= 0 && v <= 255)
      if (!t || typeof t.name !== 'string' || !STOPS.every(k => colour(t[k]))) return null
      const theme = { name: t.name.slice(0, 24) || 'Shared' }
      for (const k of THEME_KEYS) {
        if (k.endsWith('At')) { if (Number(t[k]) > 0 && Number(t[k]) < 1) theme[k] = Number(t[k]) } else if (colour(t[k])) theme[k] = { r: Math.round(t[k].r), g: Math.round(t[k].g), b: Math.round(t[k].b) }
      }
      return theme
    } catch (e) { return null }
  }
  trash.innerHTML = ICON('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')
  const loadTheme = async theme => {
    if (theme === loadedTheme && sameColours(takeColours(), loaded)) return true
    // Asked, as before, only when the colours have changed since the last theme was loaded or saved (Robert: "IF they have
    // changes from the theme that was loaded, require an r u sure"), in the words the other lists use (themeList.js).
    if (!sameColours(takeColours(), loaded) && !(await confirmReset(colourDifferences(takeColours(), theme), theme.name))) return false
    putColours(theme)
    loaded = takeColours()
    loadedTheme = theme
    afterColours()
    return true
  }
  // Editing a saved theme (Robert: "while editing a theme, it was hard to really tell that changing
  // the gradient would edit the theme"; then "we should do the accent outline too... When we click
  // edit on one of our themes, we should have the edit bar cover the other theme on the same row and
  // use the full width. then we can put an x cancel button next to the check"): the theme's place in
  // the grid becomes a row across both columns, a small tile of the theme following the colours as
  // they change, its name, a tick and a cross; the bar and that tile take the accent ring. The tick
  // keeps the colours under the name; the cross puts the theme back as it was saved, on the lamp
  // too; anything else (another theme, the plus, closing the panel) leaves the edit with the
  // colours as they are, unsaved, so loading another theme asks as it always does.
  const editName = input({ class: 'edit-name', type: 'text', maxlength: 24, autocomplete: 'off', spellcheck: false, 'aria-label': 'Theme name',
    onkeydown: e => { e.stopPropagation(); if (e.key === 'Enter') stopEditing('save'); else if (e.key === 'Escape' && !pickerWasOpen) stopEditing('cancel') } })
  const editSave = button({ class: 'icon-button primary edit-save', title: 'Save this theme', 'aria-label': 'Save this theme', onclick: () => stopEditing('save') })
  editSave.innerHTML = ICON('<path d="M4 12.5l5 5L20 6.5"/>')
  const editCancel = button({ class: 'icon-button edit-cancel', title: 'Cancel: put the theme back as it was', 'aria-label': 'Cancel the edit', onclick: () => stopEditing('cancel') })
  editCancel.innerHTML = ICON('<path d="M6 6l12 12M18 6L6 18"/>')
  // And a banner over the bar saying so (Robert: "missed adding the banner to say it's editing. we
  // should add it above the gradient and shift everything down").
  const editTitle = span()
  const editBanner = div({ class: 'edit-banner' }, span({ class: 'edit-label' }, 'Editing'), editTitle)
  gradientPending.prepend(editBanner)
  editName.addEventListener('input', () => { editTitle.textContent = editName.value.trim() || (editing && editing.theme.name) || '' })
  const startEditing = theme => {
    editing = { theme, saved: JSON.parse(JSON.stringify(theme)) }
    editName.value = theme.name
    editTitle.textContent = theme.name
    editBanner.classList.add('on')
    bar.classList.add('editing')
    fillThemes()
    setTimeout(() => { editName.focus(); editName.select() })
  }
  const stopEditing = (how = 'leave') => {
    if (!editing) return
    const { theme, saved } = editing
    if (how === 'save') {
      Object.assign(theme, takeColours(), { name: editName.value.trim().slice(0, 24) || theme.name })
      saveMyThemes()
      loaded = takeColours()
      loadedTheme = theme
      afterColours()
    } else if (how === 'cancel') {
      putColours(saved)
      loaded = takeColours()
      loadedTheme = theme
      afterColours()
    }
    editing = null
    editRow = null
    editBanner.classList.remove('on')
    bar.classList.remove('editing')
    fillThemes()
  }
  // The edited theme's tile follows the colours.
  // The edit row follows the colours in place: rebuilding the grid on every change replayed the
  // row's pop in and it flashed while a pin was dragged (Robert: "the theme edit flashes as I drag
  // the gradient").
  const themeBackground = t => `linear-gradient(90deg, ${STOPS.map((k, i) => `${css(t[k])} ${([0, t.heatCoolAt || 0.25, t.heatWarmAt || 0.5, t.heatHotAt || 0.75, 1][i] * 100).toFixed(1)}%`).join(', ')})`
  let editRow = null
  const paintEditRow = () => {
    if (!editing || !editRow) return
    const now = takeColours()
    editRow.style.background = themeBackground(now)
    if (now.bgColor) editRow.style.setProperty('--theme-back', css(liftBand(now.bgColor)))
  }
  for (const state of [...Object.values(allColours), ...livePlaces]) state.subscribe(paintEditRow)
  const BAND_LIFT = 110
  const liftBand = c => { const top = Math.max(c.r, c.g, c.b); if (top < 6 || top >= BAND_LIFT) return c; const k = BAND_LIFT / top; return { r: Math.round(c.r * k), g: Math.round(c.g * k), b: Math.round(c.b * k) } }
  const PENCIL = '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/>'
  const themeTile = (theme, mine) => {
    const shownTheme = editing && editing.theme === theme ? { ...takeColours(), name: theme.name } : theme
    const tile = button({
      class: editing && editing.theme === theme ? 'theme staged editing-tile' : theme === loadedTheme ? 'theme staged' : 'theme',
      title: theme.name,
      // The theme's background as a solid strip along the bottom of its gradient (Robert: "we should
      // include the background in the theme. we could draw it as a solid bar across the bottom"; then
      // "it should fill the entire bottom like 15-20% of the gradient button"), drawn as its own strip
      // pinned to the bottom edge (panel.css .theme::after); as a second background layer the
      // gradient showed under it.
      style: { background: `linear-gradient(90deg, ${STOPS.map((k, i) => `${css(shownTheme[k])} ${([0, shownTheme.heatCoolAt || 0.25, shownTheme.heatWarmAt || 0.5, shownTheme.heatHotAt || 0.75, 1][i] * 100).toFixed(1)}%`).join(', ')})` },
      onclick: () => {
        stopEditing()
        if (sharing && mine) {
          sharing = false
          fillThemes()
          sendLink(themeLink(theme), `${theme.name}, a lava lamp theme`, `Link to ${theme.name} copied`)
          return
        }
        if (deleting && mine) {
          ask(`Delete ${theme.name}?`, { yes: 'Delete', danger: true }).then(yes => {
            if (yes) { myThemes = myThemes.filter(t => t !== theme); if (loadedTheme === theme) loadedTheme = null; saveMyThemes() }
            deleting = false
            fillThemes()
          })
          return
        }
        loadTheme(theme).then(ok => { if (ok) fillThemes() })
      }
    }, span(theme.name))
    // Drawn brighter than it is, its brightest channel lifted to BAND_LIFT, so a near black
    // background still reads as its colour on a small strip; black stays black (Robert: "it's ok if
    // it's brighter than real, we just want it to be obvious it's a different color").
    if (shownTheme.bgColor) tile.style.setProperty('--theme-back', css(liftBand(shownTheme.bgColor)))
    if (!mine) return tile
    // The edit row is the theme itself: its gradient and background band as the row's own
    // background, the name, tick and cross on it (Robert: "the gradient view here is confusing...
    // the button closes the edit? weird. let's make the edit bar's background the gradient
    // instead").
    if (editing && editing.theme === theme) {
      const row = div({ class: 'theme-item edit-row' }, editName, div({ class: 'edit-actions' }, editSave, editCancel))
      editRow = row
      paintEditRow()
      return row
    }
    const edit = button({ class: 'theme-edit', title: `Rename or save over ${theme.name}`, 'aria-label': `Edit ${theme.name}`, onclick: () => {
      stopEditing()
      deleting = false
      sharing = false
      loadTheme(theme).then(ok => { if (ok) startEditing(theme) })
    } })
    edit.innerHTML = ICON(PENCIL)
    const item = div({ class: 'theme-item' }, tile, edit)
    return item
  }
  // Escape closes an open picker first (components.js, a capture listener on the document); only
  // an Escape with no picker open leaves the name field. Read before that listener runs.
  let pickerWasOpen = false
  window.addEventListener('keydown', e => { if (e.key === 'Escape') pickerWasOpen = !!document.querySelector('.picker') }, true)
  // Saved themes (Robert: "my daughter wanted a way to save color presets, so she could make a
  // bunch"): every colour and place, kept in this browser under MY_THEMES_KEY, which Reset leaves
  // alone.
  const MY_THEMES_KEY = 'lavalamp-my-themes'
  let myThemes = []
  try { myThemes = JSON.parse(localStorage.getItem(MY_THEMES_KEY) || '[]').filter(t => t && t.heatCold) } catch (e) { myThemes = [] }
  const saveMyThemes = () => { try { localStorage.setItem(MY_THEMES_KEY, JSON.stringify(myThemes)) } catch (e) { notify('Could not save the theme in this browser') } }
  const themesGrid = div({ class: 'themes builtin' })
  const myThemesGrid = div({ class: 'themes' })
  const fillThemes = () => {
    const add = button({
      class: 'theme theme-add',
      title: 'Save the colours as they are now as a new theme',
      'aria-label': 'Save these colours as a new theme',
      onclick: () => {
        stopEditing()
        deleting = false
        sharing = false
        let n = myThemes.length + 1
        while (myThemes.some(t => t.name === `Mine ${n}`)) n++
        const theme = { name: `Mine ${n}`, ...takeColours() }
        myThemes.push(theme)
        saveMyThemes()
        loaded = takeColours()
        loadedTheme = theme
        startEditing(theme)
      }
    }, span('+'))
    themesGrid.replaceChildren(...themes.map(t => themeTile(t, false)))
    myThemesGrid.replaceChildren(...myThemes.map(t => themeTile(t, true)), add)
    // Every tile in its own cell, so the edit row can lie over its row without moving the rest.
    // The tile the edit row lies over is hidden outright: its label drew through the row.
    const items = [...myThemesGrid.children]
    const editAt = items.findIndex(item => item.classList.contains('edit-row'))
    items.forEach((item, k) => {
      const across = k === editAt
      item.style.gridRow = String(Math.floor(k / 2) + 1)
      item.style.gridColumn = across ? '1 / -1' : String(k % 2 + 1)
      item.style.visibility = editAt >= 0 && !across && Math.floor(k / 2) === Math.floor(editAt / 2) ? 'hidden' : ''
    })
    if (!myThemes.length) { deleting = false; sharing = false }
    myThemesGrid.classList.toggle('deleting', deleting)
    myThemesGrid.classList.toggle('sharing', sharing)
    trash.classList.toggle('on', deleting)
    plane.classList.toggle('on', sharing)
    trash.style.visibility = plane.style.visibility = myThemes.length ? 'visible' : 'hidden'
  }
  fillThemes()
  // A theme link opened: offer it, then take the link out of the address so a reload does not ask again.
  const shared = readThemeLink()
  if (shared) {
    const url = new URL(window.location.href)
    url.searchParams.delete('theme')
    history.replaceState(null, '', url.pathname + url.search + url.hash)
    setTimeout(() => ask(`Add ${shared.name} to your themes?`, { yes: 'Add it', no: 'No thanks' }).then(yes => {
      if (!yes) return
      let name = shared.name
      for (let n = 2; myThemes.some(t => t.name === name); n++) name = `${shared.name} ${n}`
      const theme = { ...shared, name }
      myThemes.push(theme)
      saveMyThemes()
      putColours(theme)
      loaded = takeColours()
      loadedTheme = theme
      fillThemes()
      afterColours()
      notify(`${name} added to ${MY_COLORS}`)
    }), 600)
  }

  // The colours on the lamp matched to a theme, a saved one first, so the one on the lamp is ringed after a reload too.
  const rematchColours = () => {
    if (editing) return
    const now = normColours(takeColours())
    loaded = takeColours()
    loadedTheme = [...myThemes, ...themes].find(t => sameData(normColours(t), now)) || null
    fillThemes()
  }
  // A colour theme from a share link, kept unless the same colours are already saved.
  const addColourTheme = theme => {
    const same = myThemes.find(t => sameData(normColours(t), normColours(theme)))
    if (same) return same
    const base = String(theme.name).slice(0, 24) || 'Shared'
    let name = base
    for (let n = 2; myThemes.some(t => t.name === name); n++) name = `${base} ${n}`
    const t = { name, ...normColours(theme) }
    myThemes.push(t)
    saveMyThemes()
    return t
  }

  // My Shows: the music theme pick as a list like My Colors (Robert: "Music themes should be My effects? (I don't love my
  // effects)"; named My Shows). A show is the theme and every effect over it (settings.js showSettings); Vibes and Calm are
  // built in, Calm Vibes's own theme with both event switches and the streamers off.
  const VIBES = { name: musicThemeNames.live, ...showDefaults() }
  const CALM = { name: musicThemeNames.calm, ...showDefaults(), musicTheme: 'calm', musicFlowEvents: false, musicHeatEvents: false, streamersInMusic: false }
  // Trippy: Vibes at twice the flow and heat, the streamers drawn alone, slow to fade and bright (Robert: "these music effect
  // settings are a new show we're calling trippy", from his link: Flow and Heat strength 2, Drawn Alone, Fade 5%/s, Tail cut
  // 0.04/s, Glow 3x).
  const TRIPPY = { name: 'Trippy', ...showDefaults(), musicFlow: 2, musicHeat: 2, dyeMode: 'alone', dyeFade: 0.05, dyeCut: 0.04, dyeGlow: 3 }
  const shows = themeList({
    key: 'lavalamp.app-my-shows',
    builtins: [VIBES, CALM, TRIPPY],
    take: takeShow,
    put: putShow,
    changes: (now, show) => differences(now, show, SHOW_KEYS),
    onLoad: () => lampThemes.rematch(),
    caption: MY_SHOWS,
    what: 'show',
    newName: n => `Show ${n}`,
    fallback: 'Shared show',
    share: t => sendLink(listLink('show', { n: t.name, ...packShow(t) }), `${t.name}, a lava lamp show`, `Link to ${t.name} copied`)
  })
  // Themes: the whole lamp at once (Robert: "I think we also need to combine color, music, global toggles, and all modified
  // advanced toggles into the themes"), its colours, its show, the View switches and every Advanced setting that differs
  // from its default, only those, so a theme does not freeze the defaults of its day. Default, built in, is the lamp as
  // shipped. Its tile is its colours.
  const takeWhole = () => ({ colors: normColours(takeColours()), show: takeShow(), view: takeView(), advanced: takeAdvanced() })
  const putWhole = t => { putColours(normColours(t.colors || {})); putView(t.view || {}); putShow(t.show || {}); putAdvanced(t.advanced || {}) }
  const lampThemes = themeList({
    key: 'lavalamp.app-lamp-themes',
    builtins: [{ name: 'Default', colors: normColours({}), show: showDefaults(), view: viewDefaults(), advanced: {} }],
    take: takeWhole,
    put: putWhole,
    changes: wholeDifferences,
    paint: t => t.colors ? { background: themeBackground(t.colors), back: css(liftBand(t.colors.bgColor)) } : null,
    onLoad: () => { rematchColours(); shows.rematch() },
    caption: null,
    what: 'theme',
    newName: n => `Theme ${n}`,
    fallback: 'Shared theme',
    // Every setting: the theme, and Music on and its source as they are on the lamp now (a theme keeps no switch of its
    // own for them), so a music theme comes on for the opener as it does for a link from Share below.
    share: t => sendLink(listLink('lamp', { n: t.name, c: packColours(t.colors), s: packShow(t.show), v: packView(t.view), a: t.advanced, ...(music() ? { m: 1, ms: musicSource() } : {}) }), `${t.name}, a lava lamp theme`, `Link to ${t.name} copied`)
  })
  // Opening a show or theme link (?show=, ?lamp=; ?theme= is a colours link, the first kind, kept as it was): asked, as
  // a colours link is, then added to the list and put on the lamp, and the link taken out of the address.
  const openListLink = (param, list, unpack, what) => {
    const o = readListLink(param)
    if (!o || typeof o.n !== 'string') return
    setTimeout(() => ask(`Add ${o.n.slice(0, 24) || 'this'} to your ${what}?`, { yes: 'Add it', no: 'No thanks' }).then(yes => {
      if (!yes) return
      const t = list.adopt({ name: o.n.slice(0, 24), ...unpack(o) })
      if (param === 'lamp' && o.m) { if (musicSources.includes(o.ms)) musicSource(o.ms); music(true) }
      notify(`${t.name} added to ${what === 'shows' ? MY_SHOWS : THEMES_TITLE}`)
    }), 600)
  }
  openListLink('show', shows, o => unpackShow(o), 'shows')
  openListLink('lamp', lampThemes, o => ({ colors: unpackColours(o.c), show: unpackShow(o.s), view: unpackView(o.v), advanced: cleanAdvanced(o.a) }), 'themes')
  afterColours = () => lampThemes.rematch()

  // A share link carries the themes on the lamp that are the sender's own (Robert: "if the currently selected color or
  // effects is a sub theme, we include the theme data in the share so they get the themes and all the settings all at
  // once"): its name alone when the lamp still matches it, the link's own settings being its data, or its short form.
  const themeExtras = () => {
    const out = {}
    const c = loadedTheme && myThemes.includes(loadedTheme) ? loadedTheme : null
    if (c) out._c = sameData(normColours(c), normColours(takeColours())) ? c.name : { n: c.name, ...packColours(c) }
    const sh = shows.current()
    if (sh && sh.mine) out._s = sh.same ? sh.theme.name : { n: sh.theme.name, ...packShow(sh.data) }
    const w = lampThemes.current()
    if (w && w.mine) out._t = w.same ? w.theme.name : { n: w.theme.name, c: packColours(w.data.colors), s: packShow(w.data.show), v: packView(w.data.view), a: w.data.advanced }
    return out
  }
  // Opening one: each theme it carries is added to the opener's lists, unless they have it already, and nothing is asked.
  const extras = sharedExtras()
  if (extras) {
    const named = v => typeof v === 'string' ? v.slice(0, 24) : v && typeof v.n === 'string' ? v.n.slice(0, 24) : null
    const added = []
    if (named(extras.c)) added.push(addColourTheme(typeof extras.c === 'string' ? { name: named(extras.c), ...takeColours() } : { name: named(extras.c), ...unpackColours(extras.c) }).name)
    if (named(extras.s)) added.push(shows.add(typeof extras.s === 'string' ? { name: named(extras.s), ...takeShow() } : { name: named(extras.s), ...unpackShow(extras.s) }).name)
    if (named(extras.t)) {
      const t = extras.t
      added.push(lampThemes.add(typeof t === 'string' ? { name: named(t), ...takeWhole() } : { name: named(t), colors: unpackColours(t.c), show: unpackShow(t.s), view: unpackView(t.v), advanced: cleanAdvanced(t.a) }).name)
    }
    if (added.length) setTimeout(() => notify(`Added ${added.join(', ')}`), 400)
  }
  rematchColours()
  shows.rematch()
  lampThemes.rematch()

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
      // The colours first, then Themes, the whole lamp at once, then Touch, Music and View, every card folded as the panel first
      // opens (Robert: "We should have a global themes card, probably near the top"; "probably we should collapse all groups
      // by default").
      // The colours folded show the gradient and its background button, the picker itself; the word Colors opens the rest
      // (Robert: "The collapsed form of the color panel should be the color gradient selector with the background button.
      // The expand should be on a text label like 'color settings' or 'color options' or maybe just 'colors'").
      // The gradient over the word (Robert: "the gradient slider should be above the colors label, themes should be under
      // color, so the top thing on the page is the gradient slider at all times as this is mostly what people poke first").
      card(coloursOpen, COLORS_LABEL, { before: [div({ class: 'swatch-row' }, gradientPending)], cls: 'colours-card' },
        div({ class: 'swatch-row' },
          div({ class: 'swatch-caption my-themes-caption' }, span(MY_COLORS), span({ class: 'theme-tools' }, plane, trash)),
          themesGrid,
          myThemesGrid
        ),
        swatchRow('Flow colours', showFlow, true,
          swatch('Slow', 'flowSlow', flowSlow),
          swatch('Fast', 'flowFast', flowFast)
        ),
        hint(help, `The lava is coloured by its heat, cold at the left of the bar to hot at the right. Click a dot to change its colour and drag the middle three to move them; the button under the bar is the background. ${MY_COLORS} are starting points: click one to load it, the plus saves yours as a new one, the pencil renames or overwrites a saved one, the plane shares one and the trash deletes one. Flow colours paint the flow arrows, slow to fast.`)
      ),
      card(themesOpen, THEMES_TITLE, { tools: [span({ class: 'sub-sub music-sub themes-sub' }, 'save and share every setting'), span({ class: 'theme-tools' }, lampThemes.plane, lampThemes.trash)] },
        lampThemes.element,
        hint(help, `A theme is the whole lamp: its colours, its show, the ${VIEW_TITLE} switches and every Advanced setting you changed. Click one to load it (it asks first if that would undo changes); the plus saves the lamp as a new theme, the pencil renames or overwrites one, the plane shares one and the trash deletes one. Default is the lamp as it comes.`)
      ),
      // Touch as its own boxed sub panel with pictures: a plain row of words was invisible to a
      // thirteen year old (Robert: "I want to make it look more like a sub panel"). Folded to its title.
      card(touchOpen, 'Touch', { tools: [span({ class: 'sub-sub music-sub' }, 'what your finger does to the lava')] },
        iconChoice('touch', touchMode, TOUCH_OPTIONS),
        knobs(knob('Strength', 'touch-strength', touchStrength, { min: 0, max: 3, step: 0.1, slider: true }, () => defaultTouchStrength, v => `${Number(v).toFixed(1)}x`)),
        hint(help, 'What a finger or the mouse does to the lava under it: Push shoves it away, Pull gathers it in, Spin whirls it, Heat and Cool change its temperature. Strength is how hard, 1x as tuned.')
      ),
      // Music, folded to its title and switch (Robert: "let's put music
      // as a default collapsible group under touch, always visible. It should just have the button
      // to enable it and set the device. The remaining controls should be in the advanced").
      div({ class: musicOpen.bindAttr(() => musicOpen() ? 'sub-panel music-card' : 'sub-panel music-card folded') },
        div({ class: 'sub-title foldable', onclick: e => { if (!e.target.closest('.toggle')) musicOpen(!musicOpen()) } },
          span('Music'),
          span({ class: 'sub-sub music-sub' }, 'sync the lava to your music'),
          span({ style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            div({ class: musicPending.bindAttr(() => musicPending() ? 'pending' : '') }, toggle('music', music)),
            chevron()
          )
        ),
        div({ class: 'sub-body' },
          // The meter up here with the switch, so the card shows it hearing (Robert: "we should move
          // this sound indicator to the main audio controls... in the expanded form").
          meterRow,
          musicWaitNote,
          ...(musicSources.length > 1 ? [row('Source', segmented('music-source', musicSource, musicSources))] : []),
          // System audio comes only with a screen share, so say plainly what is and is not used
          // (Robert: "a note explaining that it's required in order to hear the audio playing on
          // the system and that we do not record any visuals from the screen or connect to any
          // devices like webcam and only use the audio stream from the screen share").
          div({ class: 'music-note', style: { display: musicSource.bindStyle(() => musicSource() === 'system' ? 'block' : 'none') } },
            'To hear what your computer is playing, the browser has to ask to share your screen, because that is the only way it hands a page the system\'s audio. Pick a tab and turn on "Also share tab audio", or a screen and "Also share system audio". Only the sound is used: the picture is switched off the moment it arrives and is never shown, kept or sent, nothing is recorded, and no camera or other device is touched.'
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
          div({ class: 'music-input', style: { display: showInput.bindStyle(() => showInput() ? 'grid' : 'none') } },
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
              div('4. Here, choose Mic as the source and Listen, allow the microphone, then choose BlackHole 2ch as the Input.'),
              div('On Windows, VB-Audio Virtual Cable does the same job.')
            )
          ]),
          button({ class: 'music-help-link', onclick: () => musicHelp(!musicHelp()) }, 'Music not working?'),
          musicHelpBody,
          // The show, picked from My Shows (the Music theme's two buttons before).
          Object.assign(shows.element, { title: `What the lamp does with the music. While a show plays, the music drives the pots and eddies instead of the lamp. Vibes is the tuned show; Calm is Vibes with no hits moving or heating the lava and no streamers, only sparkles and glow; Trippy is Vibes at double strength, drawn as bright, slow-fading streamers with the lava hidden. The plus saves the effects below as a show of your own.` }),
          // Effects, one fold under the theme pick holding every switch and slider for how the theme looks (Robert: "our
          // toggles have become unkempt. these settings for music should be in the music panel"; "under a section titled
          // 'effects', flow strength and heat strength... checkboxes for turning off global sparkle and glow"; "let's make
          // effects collapsible and put stream controls in there, then also move streamers and motion into the effects group"),
          // in three tabs, one card at a time: Flow, Heat and Streamers (EFFECT_TABS).
          div({ class: effectsOpen.bindAttr(() => effectsOpen() ? 'sub-panel nested' : 'sub-panel nested folded') },
            div({ class: 'sub-title foldable', onclick: () => effectsOpen(!effectsOpen()) }, span('Effects'), chevron()),
            div({ class: 'sub-body' },
              div({ class: 'effect-tabs', role: 'tablist' }, ...EFFECT_TABS.map(t => button({ id: 'music-effects-' + t, role: 'tab', class: effectsTab.bindAttr(() => effectsTab() === t ? 'on' : ''), 'aria-selected': effectsTab.bindAttr(() => String(effectsTab() === t)), onclick: () => effectsTab(t) }, EFFECT_TAB_NAMES[t]))),
              effectTab('flow',
                Object.assign(row('Flow events', toggle('music-flow-events', musicFlowEvents)), { title: FLOW_EVENTS_ABOUT }),
                knobs(Object.assign(knob('Flow strength', 'music-flow', musicFlow, { min: 0, max: 2, step: 0.05, slider: true }, () => defaultMusicFlow, v => `${Number(v).toFixed(1)}x`), { title: FLOW_STRENGTH_ABOUT })),
                Object.assign(row('Motion', toggle('motion-in-music', motionInMusic)), { title: MOTION_MUSIC_ABOUT }),
                hint(help, [['Flow events', FLOW_EVENTS_ABOUT], ['Flow strength', FLOW_STRENGTH_ABOUT], ['Motion', MOTION_MUSIC_ABOUT]])
              ),
              effectTab('heat',
                Object.assign(row('Heat events', toggle('music-heat-events', musicHeatEvents)), { title: HEAT_EVENTS_ABOUT }),
                knobs(Object.assign(knob('Heat strength', 'music-heat', musicHeat, { min: 0, max: 2, step: 0.05, slider: true }, () => defaultMusicHeat, v => `${Number(v).toFixed(1)}x`), { title: HEAT_STRENGTH_ABOUT })),
                pair('Sparkle', Object.assign(toggle('music-sparkle', musicSparkle), { title: SPARKLE_MUSIC_ABOUT }), 'Glow', Object.assign(toggle('music-glow', musicGlow), { title: GLOW_MUSIC_ABOUT })),
                hint(help, [['Heat events', HEAT_EVENTS_ABOUT], ['Heat strength', HEAT_STRENGTH_ABOUT], ['Sparkle', SPARKLE_MUSIC_ABOUT], ['Glow', GLOW_MUSIC_ABOUT]])
              ),
              effectTab('streamers',
                Object.assign(row('Streamers', toggle('streamers-in-music', streamersInMusic)), { title: STREAMERS_MUSIC_ABOUT }),
                dyeControls(streamersInMusic, 'music-dye'),
                hint(help, [['Streamers', STREAMERS_MUSIC_ABOUT], ['Drawn', DYE_MODE_ABOUT], ['Fade', DYE_FADE_ABOUT], ['Stamp', DYE_STAMP_ABOUT]])
              )
            )
          ),
        )
      ),
      hint(help, 'Music: the switch makes the lamp listen and move to the music. Mic hears the room, or any input you choose. On a computer, System hears what the computer plays (through a screen share; only the sound is used), and File plays a song you pick and can record a video of the lamp with it. The show and its Effects set what the music does; finer knobs are under Advanced, Music.'),
      // View: the lamp's own switches in a card, folded to its title (Robert: "I also think we should get all of those top
      // level toggles into a card").
      // Fullscreen on the card's title line, as Music's switch is on its own (Robert: "put the fullscreen checkbox on the
      // header line of view, kinda like how music enabled is there").
      // On an iPhone the switch cannot work (no page fullscreen there): a ? in its place opens the steps to the lamp with
      // nothing around it, from the Home Screen (Robert: "I think we should probably hide the checkbox on ios and replace it
      // with a ? that explains how to make fullscreen work on the app. make the directions grandma friendly and consider
      // the ios versions"; homeScreen.js has the steps). Opened from the Home Screen it already is, so neither shows.
      card(viewOpen, VIEW_TITLE, {
        tools: pageFullscreenWorks
          ? [span({ class: 'sub-sub music-sub' }, 'fullscreen'), toggle('fullscreen', fullscreen)]
          : fromHomeScreen ? [] : [span({ class: 'sub-sub music-sub' }, 'fullscreen'),
              button({ class: fullscreenHow.bindAttr(() => fullscreenHow() ? 'panel-close panel-help fullscreen-help on' : 'panel-close panel-help fullscreen-help'), title: 'How to make the lamp fill the screen', 'aria-label': 'How to make the lamp fill the screen', onclick: e => { e.stopPropagation(); fullscreenHow(!fullscreenHow()) } }, '?')],
        always: pageFullscreenWorks || fromHomeScreen ? [] : [div({ class: 'music-note fullscreen-how', role: 'status', style: { display: fullscreenHow.bindStyle(() => fullscreenHow() ? 'block' : 'none') } },
          div({ class: 'fullscreen-how-head' }, span('To make the lamp fill the whole screen, put it on your Home Screen:'),
            button({ class: 'version-banner-close', title: 'Close', 'aria-label': 'Close', onclick: () => fullscreenHow(false) }, '×')),
          ol(...homeScreenSteps().map(step => li(step))))]
      },
        // Two to a row: three did not fit the card's width.
        pair('Flow', toggle('flow', showFlow), 'Motion', toggle('motion', motionOn)),
        // The two flies side by side, each its own switch (the Ice fly the firefly's cold twin).
        pair('Firefly', Object.assign(toggle('firefly', firefly), { title: FIREFLY_ABOUT }), 'Ice fly', Object.assign(toggle('ice-fly', iceFly), { title: ICE_FLY_ABOUT })),
        hint(help, [
          ['Flow', 'Draw the stirring as arrows, like wind on a weather map.'],
          ['Motion', 'The lava follows the device: shaking the phone or moving the browser window shoves it, and tilting a phone tilts which way is down. Off, down is always the bottom of the screen. While a music show plays, Motion rests unless the show turns it on (Effects, Flow, Motion).'],
          ['Fullscreen', 'Fills the whole screen with the lamp; Esc brings the browser back. On an iPhone the switch is a ?, which shows how to open the lamp full screen from the Home Screen.']
        ]),
        pair('Streamers', Object.assign(toggle('dyed-fluid', dyedFluid), { title: DYE_ABOUT })),
        dyeControls(dyedFluid, 'dye'),
        pair('Static colors', Object.assign(toggle('static-colors', staticColors), { title: STATIC_ABOUT })),
        hint(help, [['Static colors', STATIC_ABOUT]]),
        hint(help, [['Firefly', FIREFLY_ABOUT], ['Ice fly', ICE_FLY_ABOUT], ['Streamers', DYE_ABOUT], ['Drawn', DYE_MODE_ABOUT], ['Fade', DYE_FADE_ABOUT], ['Stamp', DYE_STAMP_ABOUT]])
      )
    ),
    sectionWith(
      button({ class: help.bindAttr(() => help() ? 'panel-close panel-help on' : 'panel-close panel-help'), onclick: () => help(!help()), title: 'What the controls do', 'aria-label': 'What the controls do' }, '?'),
      'Advanced', advancedOpen,
      row('Controls', segmented('knob-style', knobStyle, knobStyles)),
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
        subgroup('Fade',
            knob('Rim pull in', 'eddy-pull-in', eddyPullIn, { min: 0, max: 1, step: 0.05 }, () => defaultEddyPullIn, fixed(2)),
            knob('Splat pull in', 'splat-pull-in', splatPullIn, { min: 0, max: 1, step: 0.05 }, () => defaultSplatPullIn, fixed(2))
          ),
        helpList(help, [
          ['Speed', 'How fast an eddy travels in from the edge when it is born, in px/s on a big screen and less on smaller ones. Each eddy is a little faster or slower than this.'],
          ['Fall off', 'How quickly an eddy slows as it ages; 0 keeps its speed. It never drops below 15% of its starting speed.'],
          ['Curve', 'The shape of the slowing: log slows fast then creeps on, linear slows steadily, exp slows hard then levels off.'],
          ['Rim pull in', 'As an eddy fades its outside dies first, so it shrinks to a tight spin in the middle. Higher shrinks it more; 0 fades the whole eddy evenly.'],
          ['Splat pull in', 'How much a splat\'s arms thin to spikes as it flies, keeping their strength, so the lava is cut into spikes instead of thrown out in fat arms; it also lasts a little longer. 0 keeps the arms wide.'],
          ['Stir', 'Speed of a slow roll through the whole lamp, up the middle and down the walls; negative runs it backwards. 0, as tuned, turns it off.'],
          ['Turb', 'How strong the eddies are, the swirls that come in from the edges and wander the lamp. 0 stills them.'],
          ['Eddies', 'How many eddies can be in the lamp at once, both kinds counted. They come in bursts with quiet gaps between; Turb sets how strong they are.'],
          ['Pace', 'How fast the whole lamp runs: 1 is full speed, lower is slow motion.']
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
          ['Period', 'How often pots light under the lava: about Pulses lightings every Period seconds, so lower is more often. 0 turns the pots off and warms the whole floor evenly.'],
          ['Conduct', 'How fast heat spreads between touching lava. Higher and a blob warms and rises as one; too high and a rising blob keeps heating the pool below through its neck and stretches into a long column.'],
          ['Max Temp', 'The hottest the lava can get. Hotter lava rises faster, so this also caps how fast it rises.'],
          ['Heat', 'How strongly a lit pot heats the lava in it: higher heats faster.'],
          ['Duration', 'The longest a small pot stays lit, in seconds; each lighting lasts between a third of this and all of it. Bigger pots stay lit longer, up to Big pot times this.'],
          ['Big pot', 'How many times longer the biggest pot stays lit than the smallest. 1 lights every pot for the same time.'],
          ['Pulses', 'How many pots light in each Period, all pots together; small pots near the middle light most often.'],
          ['Core', 'The narrowest a lit pot\'s hot spot can be, as a share of the lamp\'s shorter side. Each lighting is somewhere between this and the whole pot, and a narrow one stays lit longer.'],
          ['Floor', 'How warm the floor is between pots, as a share of full power.'],
          ['Glow', 'How much extra heat the floor gives under a lit pot, on top of Floor.']
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
        // Static colors' knobs, moved here from the View card, which keeps only the switch (Robert: "These should be the
        // default for the "static colors" in the view page, and the rest should move into a sub panel under rendering or
        // liquid"). Liquid, since they are mostly how the lava moves. Folded as the panel opens and always shown, as the
        // other Advanced knobs are; they act only while Static colors is on.
        div({ class: staticDetailOpen.bindAttr(() => staticDetailOpen() ? 'sub-panel nested' : 'sub-panel nested folded') },
          div({ class: 'sub-title foldable', onclick: () => staticDetailOpen(!staticDetailOpen()) }, span('Static colors'), chevron()),
          div({ class: 'sub-body' },
            hint(help, 'These act only while Static colors is on, in the View card.'),
            Object.assign(row('Dealt by', segmented('static-colors-by', staticColorsBy, staticColorsBys, staticColorsByNames)), { title: STATIC_BY_ABOUT }),
            knobs(
              Object.assign(knob('Density', 'static-colors-layered', staticColorsLayered, { min: 0, max: 2, step: 0.01, slider: true }, () => defaultStaticColorsLayered, fixed(2)), { title: LAYERED_ABOUT }),
              Object.assign(knob('Center', 'layer-center', layerCenter, { min: 0, max: 1, step: 0.05, slider: true }, () => defaultLayerCenter, fixed(2)), { title: LAYER_CENTER_ABOUT }),
              Object.assign(knob('Curve', 'layer-curve', layerCurve, { min: 0.25, max: 4, step: 0.05, slider: true }, () => defaultLayerCurve, fixed(2)), { title: LAYER_CURVE_ABOUT }),
              Object.assign(knob('Bands', 'layer-bands', layerBands, { min: 0, max: 12, step: 1, slider: true }, () => defaultLayerBands, bandsWords), { title: LAYER_BANDS_ABOUT })
            ),
            hint(help, [['Dealt by', STATIC_BY_ABOUT], ['Density', LAYERED_ABOUT], ['Center', LAYER_CENTER_ABOUT], ['Curve', LAYER_CURVE_ABOUT], ['Bands', LAYER_BANDS_ABOUT]]),
            pair('Reverse', Object.assign(toggle('layer-reverse', layerReverse), { title: LAYER_REVERSE_ABOUT })),
            hint(help, [['Reverse', LAYER_REVERSE_ABOUT]]),
            // Density physics (Robert: "also I wanted controls for controlling the phsyics of the density"), named in small
            // print over its row as a subgroup is.
            div({ class: 'knob-sub' }, 'Density physics'),
            knobs(
              Object.assign(knob('Mass', 'density-mass', densityMass, { min: 0, max: 1, step: 0.05, slider: true }, () => defaultDensityMass, fixed(2)), { title: DENSITY_MASS_ABOUT }),
              Object.assign(knob('Heat take', 'density-heat', densityHeat, { min: 0, max: 2, step: 0.05, slider: true }, () => defaultDensityHeat, fixed(2)), { title: DENSITY_HEAT_ABOUT }),
              Object.assign(knob('Cling', 'density-cling', densityCling, { min: 0, max: 1, step: 0.05, slider: true }, () => defaultDensityCling, fixed(2)), { title: DENSITY_CLING_ABOUT })
            ),
            hint(help, [['Mass', DENSITY_MASS_ABOUT], ['Heat take', DENSITY_HEAT_ABOUT], ['Cling', DENSITY_CLING_ABOUT]]),
            knobs(Object.assign(knob('Fly fade', 'static-fly-fade', staticFlyFade, { min: 0.5, max: 20, step: 0.5, slider: true }, () => defaultStaticFlyFade, v => `${Number(v).toFixed(1)} s`), { title: STATIC_FLY_FADE_ABOUT })),
            hint(help, [['Fly fade', STATIC_FLY_FADE_ABOUT]]))),
        helpList(help, [
          ['Count', 'How many particles make up the lava you see. The hidden pots under the floor get extra on top of this.'],
          ['Radius', 'How far apart two particles can be and still feel each other.'],
          ['Pull', 'How strongly the lava holds together: how hard each particle pulls on its neighbours within Radius.'],
          ['Near', 'The push that stops particles crowding together, balancing Pull. Lower lets the surface pack into a tight skin.'],
          ['Gravity', 'How hard gravity pulls: how fast cold lava sinks, and how hot lava must get to rise.'],
          ['Bottles', 'How deep the bottles above and the pots below are, as a fraction of their width. 0 gives a flat ceiling and floor.'],
          ['Reserve', 'How much lava the hidden pots under the floor may hold, as a multiple of the lava you see; all means no limit. A big reserve can slow the lamp down.'],
          ['Lift', 'The most lift a hot particle can have, in gravities; none means no limit. Too much and single hot particles shoot off as a spray of dots.'],
          ['Wobble', 'How long the lava keeps moving the way it was going, in seconds. 0 is thick wax; more makes stretched necks snap back and blobs jiggle.'],
          ['Settle', 'How many times a frame the particles are evened out. 2 gives a smoother surface for nearly twice the work.'],
          ['Viscosity', 'How much neighbouring particles slow each other as they close in, so necks thin and tails pull in more slowly. Needs Wobble above 0.'],
          ['Kick', 'How much bounce the lava gets from its own pull: the snap when blobs split or merge. Skin picks which particles get it.'],
          ['Cap', 'The top speed that bounce (Kick) can reach, in gravities.'],
          ['Reach', 'The furthest a particle can be pushed in one step, in radii. On the GPU it stops at 0.5, since more makes a packed cold pool burst or set into a honeycomb.'],
          ['Skin', 'Which particles get the Kick: low values give it only to the thin edges of the lava, 300 (the most) to all of it.'],
          ['Wall', 'Nudges lava within this many pixels of a side wall away from it, so it does not cling to the glass. 0 is off.']
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
        pair('Fly trails', toggle('fly-trails', showFlyTrails)),
        helpList(help, [
          ['Size', 'Radius of each drawn particle, so how fat the lava looks.'],
          ['Smooth', 'Rounds off the bumpy edges of the lava by blurring its outline this many pixels. 0 shows every particle\'s bump.'],
          ['Blend', 'How far the colours inside the lava blur into each other, in pixels, without softening the edge. Set below Smooth it adds nothing.'],
          ['Pixels', 'How many pixels the lamp is drawn with, in megapixels: fewer runs faster but softer, and a small Size can shrink to single dots. Auto Pixels sets it for you. Not saved.'],
          ['Auto Pixels', 'The lamp picks Pixels itself to hold Target: a step down after two seconds below it, a step up after one second at half again above it, never past the screen\'s own resolution. Moving Pixels by hand turns this off.'],
          ['Target', 'The frame rate Auto Pixels holds.'],
          ['Heater', 'Show the heater strip and its elements along the floor.'],
          ['Fly trails', 'Draw where each fly has been in the last 6 seconds as a fading line, fireflies orange and ice flies blue; the dot is hollow while a fly lights no lava.'],
          ['Reservoirs', 'Zooms out to show the hidden bottles above and pots below, so you can watch the lava in them. With Heater on, the pots light up as they heat.']
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
            knob('Vent', 'music-vent', musicVent, { min: 0, max: 1, step: 0.05 }, () => defaultMusicVent, fixed(2))
          ),
        subgroup('Motion',
            knob('Tempo', 'music-tempo', musicTempo, { min: 0, max: 1, step: 0.05 }, () => defaultMusicMotion.tempo, fixed(2)),
            knob('Pulse', 'music-pulse', musicPulse, { min: 0, max: 1, step: 0.05 }, () => defaultMusicMotion.pulse, fixed(2)),
            knob('Spawn', 'music-spawn', musicSpawn, { min: 0, max: 1, step: 0.05 }, () => defaultMusicMotion.spawn, fixed(2)),
            knob('Spin', 'music-spin', musicSpin, { min: 0, max: 1, step: 0.05 }, () => defaultMusicMotion.spin, fixed(2)),
            knob('Busy eddies', 'music-busy-eddies', musicBusyEddies, { min: 0, max: 8, step: 1 }, () => defaultMusicBusyEddies, fixed(0)),
            knob('Flip', 'music-flip', musicFlip, { min: 0, max: 1, step: 0.05 }, () => defaultMusicFlip, fixed(2)),
            knob('Wobble', 'music-wobble', musicWobble, { min: 0, max: 3, step: 0.1 }, () => defaultMusicWobble, fixed(1)),
            knob('Sections', 'music-sections', musicSections, { min: 0, max: 2, step: 0.1 }, () => defaultMusicSections, fixed(1))
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
        row('Log', button({ class: 'small', title: 'Save what the lamp heard and did since Music went on, ten rows a second, as a file', onclick: () => window.dispatchEvent(new Event('lavalamp-music-log')) }, 'Save')),
        ...(GLOOPS_SHOWN
          ? [pair('Gloops', div({ class: soundPending.bindAttr(() => soundPending() ? 'pending' : '') }, toggle('sound', sound))),
              row('Bed', segmented('bed', soundBed, soundBeds))]
          : []),
        helpList(help, [
          ['Sense', 'How loud the music counts as: turn up for a quiet speaker, down for a loud one. The meter shows the heat, eddy and kick ranges, and flashes on the beat.'],
          ['Every', 'Every this many beats a pot fires under the lava and, if there is room, an eddy comes in: 4 is every bar of most songs, 8 every two, 16 a phrase.'],
          ['Floor', 'How much the heat range turns up the floor heat, on top of the Floor knob: at 1x a full signal doubles it.'],
          ['Lift', 'How much the heat range raises Lift, so blobs rise harder on the drop. Does nothing while Lift is at none.'],
          ['Eddies', 'How much the eddy range swells the eddies, so each hit shoves the lava.'],
          ['Kick', 'The kick range (the yellow band, 2 to 8 kHz: hi-hats and the click of a kick). Each hit throws a small splat into the lava, 1 being a drop\'s size, and adds snap when blobs split. 0 is off.'],
          ['Lead', 'With Drop at 0: how many seconds ahead of the beat a pot is lit, so the blob rises on the beat, not after it. 0 lights it as the beat is heard.'],
          ['Drop', 'One pot is kept closed and heating up, and opens on the beat so a hot blob leaves right on it: every Every beats, and on the first kick after a breakdown. Sets how hard it blasts; 0 lights pots ahead of the beat instead (Lead).'],
          ['Boom', 'A deep, held bass note opens a pot while the song is busy, sending a burst of lava up with it. Sets how hard; 0 is off.'],
          ['Flip', 'The chance a drop reverses an eddy, so the swirl suddenly runs the other way; a deep bass note does it at an eighth of the chance. Each eddy flips once at most. 0 is off.'],
          ['Wobble', 'While a wobble bass is sweeping (the wah wah of dubstep), an eddy comes in on its second to fourth wah, then every few wahs after. Higher is more often; 0 is off.'],
          ['Sections', 'How strongly the lamp reacts to a song building to a drop: a snare roll or riser charges the drop\'s pot, the roll\'s end or a crash fires it, half time turns the eddies, and a key change counts as a drop. 0 is off.'],
          ['Busy eddies', 'The fewest eddies while the song is busy; a higher Eddies setting is kept. 0 leaves Eddies alone.'],
          ['Vent', 'The chance a beat briefly opens the pot that is charging, letting a puff of hot lava up on the beat before it closes again. 0 is off.'],
          ['Activity', 'How much the song\'s sections change the lamp: calm in a breakdown, busy where everything is playing. 0 ignores them.'],
          ['Tempo', 'How much the lamp\'s pace follows the song\'s tempo, against 120 bpm, never more than a quarter slower or a third faster.'],
          ['Pulse', 'The chance a bass hit sends a pressure wave out from an eddy, a ring that pushes the lava out and lets it back.'],
          ['Spawn', 'The chance a bass hit brings in a new eddy, more often the more energetic the music.'],
          ['Spin', 'The chance a hi-hat brings in a spinning eddy, also more often as the music gets energetic.'],
          ['Beat Lo', 'The frequencies the beat is counted in, Lo to Hi: around 40 to 150 Hz is the kick drum.'],
          ['Heat Lo', 'The frequencies that heat the lava, Lo to Hi.'],
          ['Eddy Lo', 'The frequencies that swell the eddies, Lo to Hi.'],
          ['Kick Lo', 'The frequencies of the kick range, Lo to Hi: the hi-hats that throw splats.'],
          ['Log', 'Saves what the lamp heard and did since Music went on (beats, pots, drops and more), ten rows a second, as a file to tune by.'],
          ['Spectrum', 'A strip along the bottom showing what the lamp hears: pitch up the side from red bass to violet treble, the four ranges as coloured lines, their levels and the song\'s activity along the top, white ticks on heard beats, grey on predicted ones, and a white bar where a pot fires.'],
          ...(GLOOPS_SHOWN ? [['Gloops', 'Sounds made up from the lava as it moves: a bloop where a neck snaps or a blob lands, and a bed that follows how stirred up the lava is.']] : [])
        ])
      ),
      row('Seed', div({ class: 'seed-row' }, seedField, button({ class: 'small', onclick: () => reloadWithSeed(randomSeed()), title: 'A fresh random seed' }, 'New'))),
      hint(help, 'The number behind this lamp\'s randomness: the same seed in the same size window gives the same bottles, pots and eddies. Type one or press New (the page reloads); Save keeps it.'),
      // The facts after the cards, and the versions last (Robert: "move all the text (backend,
      // version, etc) to after the cards instead of before the cards. It should go controls type
      // selector, cards, text info and version selector").
      div({ class: 'panel-info' },
        div({ class: 'panel-note' }, backendLabel.bindAs(() => `Backend: ${backendLabel()}`)),
        div({ class: 'panel-note' }, fpsLabel.bindAs(() => fpsLabel())),
        div({ class: 'panel-note' }, screenLabel.bindAs(() => screenLabel())),
        div({ class: 'panel-note' }, motionLabel.bindAs(() => motionLabel())),
        buildRow,
        div({ class: 'panel-note' }, a({ target: '_blank', rel: 'noopener', href: 'https://github.com/snowbldr/lavalamp.app' }, 'Copyright © 2020-2026 Robert Kempton'))
      ),
      versionRow
    ),
    hint(help, 'Share copies a link with these settings. Reset goes back to every default and forgets what was saved (saved themes stay). Save keeps these settings in this browser.' + (TOUCH_UI ? '' : ' Press H to hide the settings icon and leave only the lava; H, Escape or a reload brings it back.')),
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
  return { element: panel, open, close, meter, setMusicInputs, musicPrompt }
}
