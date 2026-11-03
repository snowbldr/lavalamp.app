// The spectrum view (Robert: "Maybe we need like a spectrum viewer, like playing the sound from
// left to right and showing the wave form, probably colored by frequency. I think that will help
// me understand what's going wrong here"). A strip along the bottom of the screen that scrolls
// right to left: frequency up the side on a log scale from 20 Hz to 12 kHz, each frequency in its
// own colour (red bass through violet treble), brightness by energy. The four sync ranges are
// lines through it in their own colours, each sync's level a trace in the top band, the beat a
// tick along the top, and every Nth beat (a pot and an eddy) a tall white mark. Two px of new
// column a frame and the rest shifted, so it costs one drawImage and a column of rects.
const HEIGHT = 200 // css px, the whole strip
const TRACE = 44 // css px at the top for the level traces
const LO = 20
const HI = 12000
const STEP = 2 // px scrolled a frame
const RANGE_COLOURS = { beat: '#ffffff', heat: '#ff6a3d', eddy: '#5ad1ff', kick: '#f5e663' }

export function createSpectrumView () {
  const canvas = document.createElement('canvas')
  canvas.className = 'spectrum-view'
  const legend = document.createElement('div')
  legend.className = 'spectrum-legend'
  legend.innerHTML = ['beat', 'heat', 'eddy', 'kick'].map(k => `<span style="color:${RANGE_COLOURS[k]}">${k}</span>`).join(' ') + ' <span>| white bar: pot and eddy</span>'
  const wrap = document.createElement('div')
  wrap.className = 'spectrum-wrap'
  wrap.append(canvas, legend)
  const context = canvas.getContext('2d')
  let width = 0
  const fit = () => {
    width = Math.max(1, Math.floor(window.innerWidth))
    canvas.width = width
    canvas.height = HEIGHT
    context.fillStyle = '#000'
    context.fillRect(0, 0, width, HEIGHT)
  }
  const body = HEIGHT - TRACE
  const yOf = hz => TRACE + body - body * Math.log(Math.max(LO, Math.min(HI, hz)) / LO) / Math.log(HI / LO)
  const hueOf = y => 360 * (1 - (y - TRACE) / body) * 0.78 // 0 red at the bottom to violet at the top
  const prev = { heat: 0, eddy: 0, kick: 0 }

  return {
    element: wrap,
    show (on) {
      wrap.style.display = on ? 'block' : 'none'
      if (on && width !== Math.floor(window.innerWidth)) fit()
    },
    // One frame: the analyser's bins, the levels, the ranges ({ beat: [lo, hi], ... }), and
    // whether this frame fired a pot.
    draw (spectrum, levels, ranges, fired) {
      if (!width || width !== Math.floor(window.innerWidth)) fit()
      context.drawImage(canvas, -STEP, 0)
      const x = width - STEP
      context.fillStyle = '#000'
      context.fillRect(x, 0, STEP, HEIGHT)
      if (spectrum) {
        const { bins, binHz } = spectrum
        for (let y = TRACE; y < HEIGHT; y += 2) {
          const hzTop = LO * Math.pow(HI / LO, (TRACE + body - y) / body)
          const hzBottom = LO * Math.pow(HI / LO, (TRACE + body - y - 2) / body)
          const a = Math.max(1, Math.floor(hzBottom / binHz))
          const b = Math.min(bins.length - 1, Math.max(a, Math.ceil(hzTop / binHz)))
          let v = 0
          for (let k = a; k <= b; k++) if (bins[k] > v) v = bins[k]
          if (v < 8) continue
          context.fillStyle = `hsl(${hueOf(y)}, 90%, ${Math.round(v / 255 * 62)}%)`
          context.fillRect(x, y, STEP, 2)
        }
      }
      for (const k of ['beat', 'heat', 'eddy', 'kick']) {
        const [lo, hi] = ranges[k]
        context.fillStyle = RANGE_COLOURS[k]
        context.fillRect(x, Math.round(yOf(lo)), STEP, 1)
        context.fillRect(x, Math.round(yOf(hi)), STEP, 1)
      }
      // The level traces in the top band, each sync in its range's colour.
      for (const k of ['heat', 'eddy', 'kick']) {
        const v = Math.min(1.5, levels[k] || 0) / 1.5
        const y1 = TRACE - 2 - v * (TRACE - 8)
        const y0 = TRACE - 2 - prev[k] * (TRACE - 8)
        context.fillStyle = RANGE_COLOURS[k]
        context.fillRect(x, Math.min(y0, y1), STEP, Math.max(1, Math.abs(y1 - y0)))
        prev[k] = v
      }
      if (levels.beat) { context.fillStyle = '#ffffff'; context.fillRect(x, 0, STEP, 5) }
      if (fired) { context.fillStyle = 'rgba(255,255,255,0.9)'; context.fillRect(x, 0, STEP, HEIGHT) }
    }
  }
}
