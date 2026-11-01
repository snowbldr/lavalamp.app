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
export const knob = (title, id, state, { min, max, step, scales }, resetTo, format = v => String(v)) => {
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
  return div(
    { class: 'knob-cell' },
    dial,
    label({ class: 'knob-label', for: id }, title),
    span(
      { class: 'knob-value', title: resetTo ? 'Reset to default' : '', onclick: () => resetTo && state(resetTo()) },
      state.bindAs(() => format(state()))
    ),
    scale ? span({ class: 'knob-scale', title: 'Command or control click the knob for the next scale' }, scale.bindAs(() => `to ${scale()}`)) : ''
  )
}

// A row of knobs.
export const knobs = (...cells) => div({ class: 'knobs' }, ...cells)

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
    div(
      { class: 'swatch-well', style: { background: state.bindStyle(() => rgbToHex(state())) }, onpointerdown: () => { carried = el } },
      input({
        id,
        type: 'color',
        title,
        value: state.bindAttr(() => rgbToHex(state())),
        oninput: e => state(hexToRgb(e.target.value))
      })
    ),
    label({ for: id }, title)
  )
  el.swatchState = state
  el.swatchTitle = title
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
// false). Under the swatches, the hex of the one last hovered or pressed, in a text field that can
// be copied from or pasted into (Robert: "color picker should default to hex so it's easier to
// copy and paste"; the browser's own picker cannot be told which format to open in).
export const swatchRow = (title, view, when, ...swatches) => {
  let active = swatches[0]
  const name = span({ class: 'swatch-hex-name' }, active ? active.swatchTitle : '')
  const hex = input({
    class: 'swatch-hex',
    type: 'text',
    spellcheck: false,
    maxlength: 7,
    'aria-label': `${title} hex`,
    onfocus: e => e.target.select(),
    oninput: e => {
      const v = e.target.value.trim()
      if (active && /^#?[0-9a-fA-F]{6}$/.test(v)) active.swatchState(hexToRgb(v.startsWith('#') ? v : '#' + v))
    }
  })
  const refresh = () => { if (active && document.activeElement !== hex) hex.value = rgbToHex(active.swatchState()) }
  const activate = s => { active = s; name.textContent = s.swatchTitle; refresh() }
  for (const s of swatches) {
    s.addEventListener('pointerenter', () => activate(s))
    s.addEventListener('pointerdown', () => activate(s))
    s.addEventListener('focusin', () => activate(s))
    s.swatchState.subscribe(() => { if (s === active) refresh() })
  }
  refresh()
  return div(
    { class: 'swatch-row', style: { display: view.bindStyle(() => !!view() === when ? 'block' : 'none') } },
    div({ class: 'swatch-caption' }, title),
    div({ class: 'swatches' }, ...swatches),
    div({ class: 'swatch-hexrow' }, name, hex)
  )
}

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
// without, it is untitled and always open (Robert: "Remove the word lamp").
export const section = (title, open, ...rows) => open
  ? div(
    { class: open.bindAttr(() => open() ? 'panel-section' : 'panel-section closed') },
    button(
      { class: 'panel-section-title', onclick: () => open(!open()) },
      span(title),
      span({ class: 'chevron' }, '▾')
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
