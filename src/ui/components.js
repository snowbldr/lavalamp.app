import { button, div, fnstate, input, label, span } from '@srfnstack/fntags'
import { hexToRgb, rgbToHex } from '../color.js'

// Building blocks for the settings panel. Styles live in panel.css.

// A labelled row: label, control, and an optional value readout that resets the setting when
// clicked (every setting shows its number, so the reset affordance is the number itself).
export const row = (title, control, { value, reset, forId } = {}) => div(
  { class: 'row' },
  label({ class: 'row-label', for: forId }, title),
  div({ class: value ? 'row-control' : 'row-control wide' }, control),
  value
    ? span({ class: 'row-value', title: reset ? 'Reset to default' : '', onclick: reset }, value)
    : ''
)

// A knob for a numeric state. Robert: "it would be cool if we had like cool retro knobs or
// something. they need to still be easy to use in the panel though on desktop and mobile". So it
// turns with a straight drag, sideways or up, not a circular one: KNOB_SWEEP px of drag runs
// the whole range, a tenth of that with shift held, and the wheel and the arrow keys step it.
// Double click resets. `max` may be a number or a function, for ranges that follow the window.
// With `scales` (the pinch lab), the knob's range is one of those decades, 1, 10, 100 and so on,
// each stepping at a hundredth of itself, and a command or control click moves to the next one
// (Robert, wanting Density past 15 for a big radius: "something like scaling from 10-100-1000-etc
// would be enough... maybe control click or command click changes the scale?... we probably need
// a 0-1 scale too with .01 steps... all of the controls should use this same control mode"). It
// starts on the smallest decade that holds both the given max and the current value, and the
// decade shows under the value.
// The dial is centred on the knob's default (2026-11-01, Robert, with Turb and Eddies pinned at
// the top of their dials by the CPU defaults: "let's adjust all the knobs so that the default is
// the midpoint and the range on the right and left are appropriately scaled"): the left half of
// the sweep runs from the minimum to the default, the right half from the default to the
// maximum, each at its own rate, so straight up is always the default and a drag either side
// has the whole half dial to work in. A knob whose default sits at an end (Blend 0, Wall 0) is
// plain linear. The wheel and the arrow keys still move by `step`.
const KNOB_SWEEP = 160 // px of drag for the whole range
const KNOB_ANGLE = 135 // degrees either side of straight up
export const DECADES = [1, 10, 100, 1000, 10000, 100000]
// Touch screens get sliders in place of the dials (Robert: "honestly I really like the dials,
// but only other super users will like them... On touch screens always the sliders. I think we
// should have a separate button for reset, tap on mobile will be annoying with a slider").
// ?touch on the page shows the sliders on a desktop, for checking them.
export const TOUCH_UI = (typeof window !== 'undefined') && (window.matchMedia('(pointer: coarse)').matches || new URLSearchParams(window.location.search).has('touch'))
// Dials or sliders, by choice at the top of Advanced (Robert: "let's add a switch for changing
// from the knobs to the sliders, I feel like some people will hate the knobs"). A touch screen
// starts on sliders, anything else on dials; the choice is remembered in this browser. Every knob
// carries both controls and the panel's class shows one, so switching is instant.
const KNOB_STYLE_KEY = 'lavalamp.app-v2-knob-style'
export const knobStyles = ['dials', 'sliders']
export const knobStyle = fnstate((() => { try { const v = localStorage.getItem(KNOB_STYLE_KEY); if (knobStyles.includes(v)) return v } catch {} return TOUCH_UI ? 'sliders' : 'dials' })())
knobStyle.subscribe(v => { try { localStorage.setItem(KNOB_STYLE_KEY, v) } catch {} })

// `slider: true` draws the slider on every screen (Touch Strength; Robert: "let's make touch
// strength always a slider, it looks bad as a knob").
export const knob = (title, id, state, { min, max, step, scales, slider = false }, resetTo, format = v => String(v)) => {
  const scale = scales ? fnstate(scales.find(s => s >= Math.max(typeof max === 'function' ? max() : max, state())) || scales[scales.length - 1]) : null
  const maxOf = () => scale ? scale() : typeof max === 'function' ? max() : max
  const stepOf = () => scale ? scale() / 100 : step
  // On a decade scale the minimum comes down with it, to one step, or a knob whose own minimum is
  // 1 (Stiff, Near) would be stuck on the 0 to 1 scale (Robert: "the 0-1 range slider doesn't work").
  const minOf = () => scale && min > 0 ? Math.min(min, stepOf()) : min
  const unit = f => Math.max(0, Math.min(1, f))
  // The default, when it sits strictly inside the range: the dial's centre. None on a decade dial.
  const centreOf = () => {
    if (scale || !resetTo) return null
    const c = resetTo()
    return Number.isFinite(c) && c > minOf() && c < maxOf() ? c : null
  }
  const fraction = () => {
    const v = state(); const lo = minOf(); const hi = maxOf(); const c = centreOf()
    if (c === null) return unit((v - lo) / (hi - lo))
    return unit(v <= c ? 0.5 * (v - lo) / (c - lo) : 0.5 + 0.5 * (v - c) / (hi - c))
  }
  const fromFraction = f => {
    f = unit(f); const lo = minOf(); const hi = maxOf(); const c = centreOf()
    if (c === null) return lo + f * (hi - lo)
    return f <= 0.5 ? lo + (f / 0.5) * (c - lo) : c + ((f - 0.5) / 0.5) * (hi - c)
  }
  const clamp = v => {
    const top = maxOf()
    const st = stepOf()
    const lo = minOf()
    v = Math.round((v - lo) / st) * st + lo
    v = Math.max(lo, Math.min(top, v))
    return Number(v.toFixed(6))
  }
  const nudge = steps => state(clamp(state() + steps * stepOf()))
  const nextScale = () => { const i = scales.indexOf(scale()); scale(scales[(i + 1) % scales.length]) }
  // The same mapping as the dial (the default at the middle of the travel), on a native range
  // input with a big thumb, a value, and a reset button.
  const sliderRow = () => {
    const range = input({
      id: slider ? id : `${id}-slider`,
      class: 'slider',
      type: 'range',
      min: 0,
      max: 1000,
      step: 1,
      'aria-label': title,
      value: state.bindAttr(() => String(Math.round(fraction() * 1000))),
      oninput: e => state(clamp(fromFraction(Number(e.target.value) / 1000)))
    })
    return div(
      { class: 'slider-row', 'data-knob': title },
      label({ class: 'slider-label', for: id, onclick: () => { if (!range.title) { const text = hintText.get(title); if (text) range.title = text } } }, title),
      range,
      span({ class: 'slider-value' }, state.bindAs(() => format(state()))),
      resetTo ? button({ class: 'reset', title: 'Reset to default', 'aria-label': `Reset ${title}`, onclick: () => state(resetTo()) }, '↺') : span()
    )
  }
  if (slider) return sliderRow()
  let drag = null
  const dial = div(
    {
      id,
      class: 'knob',
      tabindex: 0,
      role: 'slider',
      'aria-label': title,
      'aria-valuemin': scale ? scale.bindAttr(() => minOf()) : min,
      'aria-valuemax': scale ? scale.bindAttr(() => maxOf()) : state.bindAttr(() => maxOf()),
      'aria-valuenow': state.bindAttr(),
      // The hint for this knob is registered after the knob is built (see hint), so the tooltip is
      // looked up on the first hover.
      onmouseenter: () => { if (!dial.title) { const text = hintText.get(title); if (text) dial.title = text } },
      'aria-valuetext': state.bindAttr(() => format(state())),
      onpointerdown: e => {
        if (scale && (e.metaKey || e.ctrlKey)) { nextScale(); e.preventDefault(); return }
        drag = { x: e.clientX, y: e.clientY, value: state(), fraction: fraction() }
        dial.classList.add('turning')
        try { dial.setPointerCapture(e.pointerId) } catch (err) {}
        e.preventDefault()
      },
      onpointermove: e => {
        if (!drag) return
        const travel = (e.clientX - drag.x) + (drag.y - e.clientY)
        const sweep = e.shiftKey ? KNOB_SWEEP * 10 : KNOB_SWEEP
        state(clamp(fromFraction(drag.fraction + travel / sweep)))
      },
      onpointerup: () => { drag = null; dial.classList.remove('turning') },
      onpointercancel: () => { drag = null; dial.classList.remove('turning') },
      onlostpointercapture: () => { drag = null; dial.classList.remove('turning') },
      onwheel: e => {
        e.preventDefault()
        nudge(e.deltaY < 0 ? 1 : -1)
      },
      onkeydown: e => {
        const keys = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }
        if (e.key in keys) nudge(keys[e.key])
        else if (e.key === 'Home') state(minOf())
        else if (e.key === 'End') state(maxOf())
        else return
        e.preventDefault()
      },
      ondblclick: () => resetTo && state(resetTo())
    },
    div({
      class: 'knob-ring',
      style: {
        background: state.bindStyle(() => {
          const sweep = 2 * KNOB_ANGLE
          const lit = fraction() * sweep
          return `conic-gradient(from -${KNOB_ANGLE}deg, var(--accent) 0deg ${lit}deg, rgba(255,255,255,0.14) ${lit}deg ${sweep}deg, transparent ${sweep}deg 360deg)`
        })
      }
    }),
    div(
      { class: 'knob-face', style: { transform: state.bindStyle(() => `rotate(${-KNOB_ANGLE + fraction() * 2 * KNOB_ANGLE}deg)`) } },
      div({ class: 'knob-pointer' })
    )
  )
  const dialCell = div(
    { class: 'knob-cell' },
    dial,
    label({ class: 'knob-label', for: id }, title),
    span(
      { class: 'knob-value', title: resetTo ? 'Reset to default' : '', onclick: () => resetTo && state(resetTo()) },
      state.bindAs(() => format(state()))
    ),
    scale ? span({ class: 'knob-scale', title: 'Command or control click the knob for the next scale' }, scale.bindAs(() => `to ${scale()}`)) : ''
  )
  return div({ class: 'knob-dual', 'data-knob': title }, dialCell, sliderRow())
}

// A row of knobs; on a touch screen a stack of sliders.
export const knobs = (...cells) => div({ class: cells.every(c => c.classList && c.classList.contains('slider-row')) ? 'knobs sliders' : 'knobs' }, ...cells)

// The Advanced list: each group a card like Colours and Touch, its knobs packed four to a row
// in one grid with the subgroup named in small print over its first knob, the other rows
// (switches, hints) under the grid (Robert: "we should pack these. each group should be a card
// like above, each row should hold max 4"). On a touch screen the knobs are sliders in a stack,
// so there the subgroup name is a line of its own. A subgroup is knob cells, nothing else.
export const subgroup = (title, ...cells) => ({ subgroup: title, cells })
// The help for a group's knobs, laid out by group() under each row of knobs in the row's own
// order (Robert: "The help should be written per row not group. left to right should read top
// to bottom"). Registers the texts for the tooltips as hint() does.
export const helpList = (help, entries) => { for (const [name, text] of entries) hintText.set(name, text); return { help, entries } }
export const group = (title, ...rows) => {
  const packed = [] // knob cells, or on a touch screen subgroup lines and slider rows
  const rest = []
  let helpFor = null
  for (const r of rows) {
    if (r && r.subgroup !== undefined) {
      r.cells.forEach((cell, i) => {
        cell.prepend(div({ class: 'knob-sub' }, i === 0 ? r.subgroup : ''))
        packed.push(cell)
      })
    } else if (r && r.entries) helpFor = r
    else rest.push(r)
  }
  // Rows of four dials, each followed by its four hints; sliders one to a row with their hint.
  const perRow = 4
  const out = []
  let rowCells = []
  const flush = () => {
    if (!rowCells.length) return
    out.push(div({ class: 'knobs' }, ...rowCells))
    if (helpFor) {
      const names = rowCells.map(c => c.dataset && c.dataset.knob).filter(Boolean)
      const entries = names.map(n => helpFor.entries.find(e => e[0] === n)).filter(Boolean)
      if (entries.length) out.push(hint(helpFor.help, entries))
    }
    rowCells = []
  }
  for (const el of packed) {
    if (el.classList && el.classList.contains('subgroup-title')) { flush(); out.push(el); continue }
    rowCells.push(el)
    if (rowCells.length === perRow) flush()
  }
  flush()
  // Hints for anything in the group that is not a knob (the switches) come after the rest.
  const leftover = helpFor ? helpFor.entries.filter(e => !packed.some(c => c.dataset && c.dataset.knob === e[0])) : []
  return div(
    { class: 'sub-panel group' },
    div({ class: 'sub-title' }, span(title)),
    ...out,
    ...rest,
    ...(leftover.length ? [hint(helpFor.help, leftover)] : [])
  )
}

// One sentence about a control, shown while help is on (`help` is a boolean fnstate). Robert:
// "we should have a ? icon to click that opens a brief one sentence explanation of each control
// and what it changes". `lines` is text, or pairs of [name, text] for a row of knobs.
// Every named hint is also kept by name, so a knob can carry its sentence as a tooltip (Robert:
// "hovering a knob should show a tooltip with it's explanation"); see tooltips() below.
export const hintText = new Map()
export const hint = (help, lines) => {
  if (typeof lines !== 'string') for (const [name, text] of lines) hintText.set(name, text)
  return div(
    { class: 'hint', style: { display: help.bindStyle(() => help() ? 'block' : 'none') } },
    ...(typeof lines === 'string'
      ? [lines]
      : lines.map(([name, text]) => div(span({ class: 'hint-name' }, name), ' ', text)))
  )
}
// Give every knob under `root` its hint as a title, once the panel is built.
export const tooltips = root => {
  for (const dial of root.querySelectorAll('.knob')) {
    const text = hintText.get(dial.getAttribute('aria-label'))
    if (text) dial.title = text
  }
}

// A round swatch with the colour input hidden over it. The element carries its state and title
// so a row can show and edit the hex, and so a colour can be dragged from one swatch onto
// another: press on a swatch, let go over another, and that one takes the colour (Robert,
// 2026-11-01: "copy from other settings buttons would also be awesome, that would make it really
// nice to step through progressions"). The native picker opens on a plain click as before.
let carried = null // the swatch a pointer went down on
export const swatch = (title, id, state) => {
  const el = div(
    { class: 'swatch' },
    div({
      id,
      class: 'swatch-well',
      role: 'button',
      tabindex: 0,
      title,
      'aria-label': `${title} colour`,
      style: { background: state.bindStyle(() => rgbToHex(state())) },
      onpointerdown: () => { carried = el },
      onclick: () => picker(el),
      onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { picker(el); e.preventDefault() } }
    }),
    label({ for: id, onclick: () => picker(el) }, title)
  )
  el.swatchState = state
  el.swatchTitle = title
  return el
}

// The colour picker, the lamp's own rather than the browser's (Robert, 2026-11-01: "can we make a
// custom js color picker or import one? I really want the buttons"): a saturation and value
// square, a hue strip, the hex, and a From row of the other swatches in the same row, one click
// to take a colour from any of them, for stepping a gradient along. It opens under the row of the
// swatch clicked and closes on a click anywhere else or Escape.
const rgbToHsv = ({ r, g, b }) => {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = (h * 60 + 360) % 360
  }
  return { h, s: max > 0 ? d / max : 0, v: max }
}
const hsvToRgb = (h, s, v) => {
  const c = v * s; const x = c * (1 - Math.abs((h / 60) % 2 - 1)); const m = v - c
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) }
}
let openPicker = null
const closePicker = () => {
  if (!openPicker) return
  openPicker.remove()
  openPicker = null
  document.removeEventListener('pointerdown', pickerOutside, true)
  document.removeEventListener('keydown', pickerEscape, true)
}
function pickerOutside (e) { if (openPicker && !openPicker.contains(e.target) && !e.target.closest('.swatch')) closePicker() }
function pickerEscape (e) { if (e.key === 'Escape') closePicker() }
export const picker = sw => {
  const reopen = openPicker && openPicker.swatch === sw
  closePicker()
  if (reopen) return
  const state = sw.swatchState
  let { h, s, v } = rgbToHsv(state())
  const svDot = div({ class: 'picker-dot' })
  const hueDot = div({ class: 'picker-dot' })
  const hex = input({
    class: 'swatch-hex picker-hex',
    type: 'text',
    maxlength: 7,
    spellcheck: false,
    'aria-label': `${sw.swatchTitle} hex`,
    onfocus: e => e.target.select(),
    oninput: e => {
      const t = e.target.value.trim()
      if (/^#?[0-9a-fA-F]{6}$/.test(t)) { state(hexToRgb(t.startsWith('#') ? t : '#' + t)); ({ h, s, v } = rgbToHsv(state())); paint() }
    }
  })
  const paint = () => {
    sv.style.background = `linear-gradient(to top, #000, rgba(0, 0, 0, 0)), linear-gradient(to right, #fff, hsl(${h} 100% 50%))`
    svDot.style.left = `${s * 100}%`
    svDot.style.top = `${(1 - v) * 100}%`
    hueDot.style.left = `${h / 360 * 100}%`
    if (document.activeElement !== hex) hex.value = rgbToHex(state())
  }
  const set = () => { state(hsvToRgb(h, s, v)); paint() }
  // A straight drag on either strip: the pointer is captured so the drag may leave the box.
  const dragger = (el, onAt) => {
    let down = false
    const at = e => { const r = el.getBoundingClientRect(); onAt(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))) }
    el.onpointerdown = e => { down = true; try { el.setPointerCapture(e.pointerId) } catch (err) {} at(e); e.preventDefault() }
    el.onpointermove = e => { if (down) at(e) }
    el.onpointerup = el.onpointercancel = () => { down = false }
  }
  const sv = div({ class: 'picker-sv' }, svDot)
  const hue = div({ class: 'picker-hue' }, hueDot)
  dragger(sv, (fx, fy) => { s = fx; v = 1 - fy; set() })
  dragger(hue, fx => { h = Math.min(359.99, fx * 360); set() })
  const others = [...sw.parentElement.children].filter(o => o !== sw && o.swatchState)
  const from = div(
    { class: 'picker-from' },
    span({ class: 'picker-from-label' }, 'From'),
    ...others.map(o => button({
      type: 'button',
      class: 'picker-from-well',
      title: `Take ${o.swatchTitle}'s colour`,
      'aria-label': `Take ${o.swatchTitle}'s colour`,
      style: { background: o.swatchState.bindStyle(() => rgbToHex(o.swatchState())) },
      onclick: () => { state({ ...o.swatchState() }); ({ h, s, v } = rgbToHsv(state())); paint() }
    }))
  )
  const el = div({ class: 'picker' }, div({ class: 'picker-title' }, sw.swatchTitle), sv, hue, div({ class: 'picker-row' }, hex), from)
  el.swatch = sw
  sw.closest('.swatch-row').appendChild(el)
  openPicker = el
  paint()
  document.addEventListener('pointerdown', pickerOutside, true)
  document.addEventListener('keydown', pickerEscape, true)
  return el
}
document.addEventListener('pointerup', e => {
  if (!carried) return
  const from = carried
  carried = null
  const under = document.elementFromPoint(e.clientX, e.clientY)
  const target = under && under.closest('.swatch')
  if (target && target !== from && target.swatchState) {
    target.swatchState({ ...from.swatchState() })
    notify(`${target.swatchTitle} takes ${from.swatchTitle}'s colour`)
  }
})

// A captioned row of swatches, shown while the boolean fnstate `view` is on (or off, if `when` is
// false). The hex field under them is gone (Robert: "I think we should get rid of the hex color
// code actually. the color from is a way better ui than the hex codes"); the picker keeps its own.
export const swatchRow = (title, view, when, ...swatches) => div(
  { class: 'swatch-row', style: { display: view.bindStyle(() => !!view() === when ? 'block' : 'none') } },
  div({ class: 'swatch-caption' }, title),
  div({ class: 'swatches' }, ...swatches)
)

// A segmented control for a state that takes one of a few words.
export const segmented = (idPrefix, state, options) => div(
  { class: 'segmented' },
  ...options.map(option => button(
    {
      id: `${idPrefix}-${option}`,
      class: state.bindAttr(() => state() === option ? 'on' : ''),
      onclick: () => state(option)
    },
    option
  ))
)

// A choice shown as pictures with a word under each, for the touch modes (Robert: "my 13 yr old
// step daughter literally could not see the touch controls. Maybe some little pictures to
// explain the different touch modes would be good too"). Each option is { value, label, svg }.
export const iconChoice = (idPrefix, state, options) => div(
  { class: 'icon-choice' },
  ...options.map(option => {
    const picture = document.createElement('span')
    picture.className = 'icon'
    picture.innerHTML = option.svg
    return button(
      {
        id: `${idPrefix}-${option.value}`,
        class: state.bindAttr(() => state() === option.value ? 'on' : ''),
        title: option.title || option.label,
        onclick: () => state(option.value)
      },
      picture,
      span(option.label)
    )
  })
)

// An on/off switch for a boolean state.
export const toggle = (id, state) => button({
  id,
  class: state.bindAttr(() => state() ? 'toggle on' : 'toggle'),
  role: 'switch',
  'aria-checked': state.bindAttr(() => String(!!state())),
  onclick: () => state(!state())
})

// Two labelled controls side by side, for switches (Robert: "let's put two toggles in each row").
export const pair = (titleA, controlA, titleB, controlB) => div(
  { class: 'pair' },
  div({ class: 'pair-cell' }, label({ class: 'row-label' }, titleA), controlA),
  titleB ? div({ class: 'pair-cell' }, label({ class: 'row-label' }, titleB), controlB) : div({ class: 'pair-cell' })
)

// A section. With `open` (a fnstate holding whether it is open) the title bar folds it away;
// without, it is untitled and always open (Robert: "Remove the word lamp"). `tools`, when
// given, sit on the title bar beside the chevron (the help button lives by Advanced; Robert:
// "probably can move the ? down by advanced").
export const section = (title, open, ...rows) => sectionWith(null, title, open, ...rows)
export const sectionWith = (tools, title, open, ...rows) => open
  ? div(
    { class: open.bindAttr(() => open() ? 'panel-section' : 'panel-section closed') },
    div(
      { class: 'panel-section-head' },
      button(
        { class: 'panel-section-title', onclick: () => open(!open()) },
        span(title),
        span({ class: 'chevron' }, '▾')
      ),
      ...(tools ? [tools] : [])
    ),
    div({ class: 'panel-rows' }, ...rows)
  )
  : div(
    { class: 'panel-section' },
    div({ class: 'panel-rows' }, ...rows)
  )

export function notify (...message) {
  const notification = div(
    {
      style: {
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        width: '25vw',
        'min-width': '250px',
        background: 'rgba(20, 20, 22, 0.86)',
        color: '#ececec',
        'text-align': 'center',
        'line-height': '80px',
        'font-size': '20px',
        'font-family': 'system-ui, sans-serif',
        'z-index': 100,
        'border-radius': '12px'
      }
    },
    ...message
  )
  document.body.append(notification)
  const duration = 2000
  notification.animate([{ opacity: 1 }, { opacity: 0 }], duration)
  notification.style.opacity = 0
  setTimeout(() => notification.remove(), duration)
}
