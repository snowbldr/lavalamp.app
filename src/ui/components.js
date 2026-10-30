import { button, div, input, label, span } from '@srfnstack/fntags'
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
const KNOB_SWEEP = 160 // px of drag for the whole range
const KNOB_ANGLE = 135 // degrees either side of straight up
export const knob = (title, id, state, { min, max, step }, resetTo, format = v => String(v)) => {
  const maxOf = () => typeof max === 'function' ? max() : max
  const fraction = () => Math.max(0, Math.min(1, (state() - min) / (maxOf() - min)))
  const clamp = v => {
    const top = maxOf()
    v = Math.round((v - min) / step) * step + min
    v = Math.max(min, Math.min(top, v))
    return Number(v.toFixed(6))
  }
  const nudge = steps => state(clamp(state() + steps * step))
  let drag = null
  const dial = div(
    {
      id,
      class: 'knob',
      tabindex: 0,
      role: 'slider',
      'aria-label': title,
      'aria-valuemin': min,
      'aria-valuemax': state.bindAttr(() => maxOf()),
      'aria-valuenow': state.bindAttr(),
      'aria-valuetext': state.bindAttr(() => format(state())),
      onpointerdown: e => {
        drag = { x: e.clientX, y: e.clientY, value: state() }
        dial.classList.add('turning')
        try { dial.setPointerCapture(e.pointerId) } catch (err) {}
        e.preventDefault()
      },
      onpointermove: e => {
        if (!drag) return
        const travel = (e.clientX - drag.x) + (drag.y - e.clientY)
        const sweep = e.shiftKey ? KNOB_SWEEP * 10 : KNOB_SWEEP
        state(clamp(drag.value + travel / sweep * (maxOf() - min)))
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
        else if (e.key === 'Home') state(min)
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
    )
  )
}

// A row of knobs.
export const knobs = (...cells) => div({ class: 'knobs' }, ...cells)

// A round swatch with the colour input hidden over it.
export const swatch = (title, id, state) => div(
  { class: 'swatch' },
  div(
    { class: 'swatch-well', style: { background: state.bindStyle(() => rgbToHex(state())) } },
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

// A captioned row of swatches, shown while the boolean fnstate `view` is on (or off, if `when` is false).
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

// An on/off switch for a boolean state.
export const toggle = (id, state) => button({
  id,
  class: state.bindAttr(() => state() ? 'toggle on' : 'toggle'),
  role: 'switch',
  'aria-checked': state.bindAttr(() => String(!!state())),
  onclick: () => state(!state())
})

// A section. With `open` (a fnstate holding whether it is open) the title bar folds it away;
// without, it is a plain heading and always open.
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
    div({ class: 'panel-section-title plain' }, span(title)),
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
