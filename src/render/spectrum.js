// The spectrum view (Robert: "Maybe we need like a spectrum viewer, like playing the sound from
// left to right and showing the wave form, probably colored by frequency. I think that will help
// me understand what's going wrong here"). A strip along the bottom of the screen that sweeps
// left to right: frequency up the side on a log scale from 20 Hz to 12 kHz, each frequency in its
// own colour (red bass through violet treble), brightness by energy. The four sync ranges are
// lines through it in their own colours, each sync's level a trace in the top band, the beat a
// tick along the top, the beat the clock predicts a grey tick under it, the music's activity a
// violet trace, and every pot fired a tall white mark.
const HEIGHT = 200 // css px, the whole strip
const TRACE = 44 // css px at the top for the level traces
const LO = 20
const HI = 12000
const STEP = 2 // px a frame
const GAP = 8 // px of black ahead of the cursor, so the newest column reads as now
const RANGE_COLOURS = { beat: '#ffffff', heat: '#ff6a3d', eddy: '#5ad1ff', kick: '#f5e663', activity: '#b28cff' }
const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

// It sweeps left to right rather than scrolling: scrolling drew the whole canvas onto itself
// every frame, and beside the WebGPU lamp that copy stalled the page (Robert: "having the sound
// spectrum on the screen makes it laggy af"). Now a frame is one putImageData of a column
// STEP px wide, its colours from a table built once.
export function createSpectrumView () {
  const canvas = document.createElement('canvas')
  canvas.className = 'spectrum-view'
  const legend = document.createElement('div')
  legend.className = 'spectrum-legend'
  legend.innerHTML = ['beat', 'heat', 'eddy', 'kick', 'activity'].map(k => `<span style="color:${RANGE_COLOURS[k]}">${k}</span>`).join(' ') + ' <span>| white bar: pot fired, grey tick: predicted beat</span>'
  const wrap = document.createElement('div')
  wrap.className = 'spectrum-wrap'
  wrap.append(canvas, legend)
  const context = canvas.getContext('2d')
  let width = 0
  let cursor = 0
  const column = context.createImageData(STEP + GAP, HEIGHT)
  const px = column.data
  const fit = () => {
    width = Math.max(1, Math.floor(window.innerWidth))
    canvas.width = width
    canvas.height = HEIGHT
    context.fillStyle = '#000'
    context.fillRect(0, 0, width, HEIGHT)
    cursor = 0
  }
  const body = HEIGHT - TRACE
  const yOf = hz => TRACE + body - body * Math.log(Math.max(LO, Math.min(HI, hz)) / LO) / Math.log(HI / LO)
  // The colour of every row at every brightness, once: red bass at the bottom to violet on top.
  const LEVELS = 32
  const table = new Uint8Array(HEIGHT * LEVELS * 3)
  for (let y = 0; y < HEIGHT; y++) {
    const h = Math.max(0, 360 * (1 - (y - TRACE) / body) * 0.78) / 360
    for (let l = 0; l < LEVELS; l++) {
      const light = l / (LEVELS - 1) * 0.62
      const q = light < 0.5 ? light * 1.9 : light + 0.9 - light * 0.9
      const p = 2 * light - q
      const hue = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p }
      const o = (y * LEVELS + l) * 3
      table[o] = 255 * hue(h + 1 / 3); table[o + 1] = 255 * hue(h); table[o + 2] = 255 * hue(h - 1 / 3)
    }
  }
  const colours = Object.fromEntries(Object.entries(RANGE_COLOURS).map(([k, v]) => [k, rgbOf(v)]))
  const put = (y, [r, g, b], a = 1) => {
    y = Math.round(y)
    if (y < 0 || y >= HEIGHT) return
    for (let x = 0; x < STEP; x++) {
      const o = (y * (STEP + GAP) + x) * 4
      px[o] = px[o] * (1 - a) + r * a; px[o + 1] = px[o + 1] * (1 - a) + g * a; px[o + 2] = px[o + 2] * (1 - a) + b * a
    }
  }
  const prev = { heat: 0, eddy: 0, kick: 0, activity: 0 }

  return {
    element: wrap,
    show (on) {
      wrap.style.display = on ? 'block' : 'none'
      if (on && width !== Math.floor(window.innerWidth)) fit()
    },
    // One frame: the analyser's bins, the levels, the ranges ({ beat: [lo, hi], ... }), whether
    // this frame fired a pot, and whether a predicted beat fell in it.
    draw (spectrum, levels, ranges, fired, predicted) {
      if (!width || width !== Math.floor(window.innerWidth)) fit()
      px.fill(0)
      for (let i = 3; i < px.length; i += 4) px[i] = 255
      if (spectrum) {
        const { bins, binHz } = spectrum
        for (let y = TRACE; y < HEIGHT; y++) {
          const hzTop = LO * Math.pow(HI / LO, (TRACE + body - y) / body)
          const hzBottom = LO * Math.pow(HI / LO, (TRACE + body - y - 1) / body)
          const a = Math.max(1, Math.floor(hzBottom / binHz))
          const b = Math.min(bins.length - 1, Math.max(a, Math.ceil(hzTop / binHz)))
          let v = 0
          for (let k = a; k <= b; k++) if (bins[k] > v) v = bins[k]
          if (v < 8) continue
          const o = (y * LEVELS + Math.round(v / 255 * (LEVELS - 1))) * 3
          put(y, [table[o], table[o + 1], table[o + 2]])
        }
      }
      for (const k of ['beat', 'heat', 'eddy', 'kick']) {
        put(yOf(ranges[k][0]), colours[k])
        put(yOf(ranges[k][1]), colours[k])
      }
      // The level traces in the top band, each sync in its range's colour, and the activity.
      for (const k of ['heat', 'eddy', 'kick', 'activity']) {
        const v = k === 'activity' ? Math.min(1, levels.activity || 0) : Math.min(1.5, levels[k] || 0) / 1.5
        const y1 = TRACE - 2 - v * (TRACE - 8)
        const y0 = TRACE - 2 - prev[k] * (TRACE - 8)
        for (let y = Math.min(y0, y1); y <= Math.max(y0, y1) + 0.5; y++) put(y, colours[k])
        prev[k] = v
      }
      if (levels.beat) for (let y = 0; y < 5; y++) put(y, [255, 255, 255])
      if (predicted) for (let y = 5; y < 12; y++) put(y, [150, 150, 150])
      if (fired) for (let y = 0; y < HEIGHT; y++) put(y, [255, 255, 255], 0.9)
      context.putImageData(column, cursor, 0)
      cursor += STEP
      if (cursor >= width) cursor = 0
    }
  }
}
