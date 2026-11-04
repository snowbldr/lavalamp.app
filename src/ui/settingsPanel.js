import { a, button, div, fnstate, input, span } from '@srfnstack/fntags'
import { TOUCH_UI, ask, chevron, group, picker, helpList, hint, iconChoice, knob, knobStyle, knobStyles, knobs, notify, pair, row, section, sectionWith, segmented, subgroup, swatch, swatchRow, toggle, tooltips } from './components.js'
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
  // The build that is deployed (Robert: "I can't tell if it's deployed, let's add a version viewable
  // after expanding advanced"): the deploy writes the commit and its date into version.txt (the
  // snowbuilt lavalamp.app Dockerfile); served from a checkout there is none, so it says local.
  const buildRow = div({ class: 'panel-note' }, 'Build: local')
  fetch('version.txt', { cache: 'no-store' }).then(r => r.ok ? r.text() : null).then(text => { if (text && text.trim() && !/<html/i.test(text)) buildRow.textContent = `Build: ${text.trim()}` }).catch(() => {})
  versions().then(list => {
    const newer = list.filter(v => Number(v.version) > Number(CURRENT))
    const older = list.filter(v => Number(v.version) < Number(CURRENT))
    versionRow.replaceChildren(
      span(`Version ${CURRENT}${newer.length ? '' : ', the newest'}. `),
      ...newer.map(v => button({ class: 'small primary', style: { 'margin-right': '6px' }, title: v.description, onclick: async () => { if (await ask(`Upgrade to ${v.label}? These settings are mapped onto it; this version's save is kept.`, { yes: 'Upgrade' })) window.location.href = `${v.path}&upgrade=${CURRENT}&from=${encodeURIComponent(btoa(JSON.stringify(getSettings())))}` } }, `Upgrade to ${v.label}`)),
      span('Older: '),
      ...older.map(v => button({ class: 'small', style: { 'margin-right': '6px' }, title: `${v.date}: ${v.description}`, onclick: () => goTo(v.version) }, v.label))
    )
  })
  const open = () => document.body.append(panel)
  const close = () => { stopEditing(); panel.remove() }

  const copyShareLink = () =>
    navigator.clipboard.writeText(shareLink()).then(
      () => notify('Link copied to clipboard'),
      err => {
        notify('Failed to copy share link')
        console.error(err)
      }
    )

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
  // allowed to overlap"). Everything goes straight onto the lamp.
  const GAP_PX = 30
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
    const place = u => {
      const p = livePlaces.map(s => s())
      const gap = Math.min(0.24, GAP_PX / Math.max(1, bar.getBoundingClientRect().width))
      const lo = k === 1 ? gap : p[k - 2] + gap
      const hi = k === 3 ? 1 - gap : p[k] - gap
      livePlaces[k - 1](Math.round(Math.max(lo, Math.min(hi, u)) * 1000) / 1000)
    }
    dot.addEventListener('pointerdown', e => {
      e.preventDefault()
      const x0 = e.clientX
      let moved = false
      dot.setPointerCapture(e.pointerId)
      const move = ev => {
        if (!pin) return
        if (!moved && Math.abs(ev.clientX - x0) < 4) return
        moved = true
        const r = bar.getBoundingClientRect()
        place((ev.clientX - r.left) / r.width)
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
    if (!sameColours(takeColours(), loaded) && !(await ask(`Your colour changes aren't saved as a theme. Load ${theme.name} anyway?`, { yes: `Load ${theme.name}`, no: 'Keep mine' }))) return false
    putColours(theme)
    loaded = takeColours()
    loadedTheme = theme
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
    } else if (how === 'cancel') {
      putColours(saved)
      loaded = takeColours()
      loadedTheme = theme
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
          navigator.clipboard.writeText(themeLink(theme)).then(() => notify(`Link to ${theme.name} copied`), () => notify('Could not copy the link'))
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
      const row = div({ class: 'theme-item edit-row' }, editName, editSave, editCancel)
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
      notify(`${name} added to your themes`)
    }), 600)
  }

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
      div({ class: 'swatch-row' },
        gradientPending
      ),
      div({ class: 'swatch-row' },
        div({ class: 'swatch-caption' }, 'Themes'),
        themesGrid,
        div({ class: 'swatch-caption my-themes-caption' }, span('My themes'), span({ class: 'theme-tools' }, plane, trash)),
        myThemesGrid
      ),
      swatchRow('Flow colours', showFlow, true,
        swatch('Slow', 'flowSlow', flowSlow),
        swatch('Fast', 'flowFast', flowFast)
      ),
      hint(help, 'The lava is coloured by its heat, coldest and sinking to hottest. The bar is the heat colours: click a dot to change it, drag the middle three along the bar. A theme is a starting point: click one to load it, and the plus saves what you have as a new one (the pencil renames a saved one or saves over it). The flow colours are the slowest to fastest arrow.')
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
      buildRow,
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
            knob('Vent', 'music-vent', musicVent, { min: 0, max: 1, step: 0.05 }, () => defaultMusicVent, fixed(2))
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
          ['Vent', 'The chance a beat lifts the lid of the pot that is closed and charging, for a moment: a puff of its superheated lava goes up with the beat, and the pot closes again and keeps charging. 0 is off.'],
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
