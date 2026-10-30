const HIGHLIGHT_HEIGHT = 15
const ALPHA_THRESHOLD = 70
// The threshold and highlight passes touch every pixel in JavaScript, so the canvas has at most
// this many pixels and CSS stretches it to the window; the compositor does that scaling for free.
// One million is the 1000 x 1000 lamp the pass was written for. A 2560 x 1300 window at full
// resolution took 108 ms a frame. The stretch softens the blob edges by a pixel or two, which
// lava can afford.
const PIXEL_BUDGET = 1_000_000
// The flow overlay: arrows on a grid this many window pixels apart, the fastest flow on screen
// drawn as an arrow reaching most of the way to the next.
const FLOW_SPACING = 80

// Draws the particles as soft discs, thresholds the alpha channel so that overlapping discs fuse
// into one blob (the classic metaball trick), then lights the underside of every blob with a short
// gradient, as if lit by the bulb below.
// `look` is a plain object the caller keeps up to date: { lavaColor, highlightColor, particleSize, showFlow }
export function createCanvasRenderer (canvas, look) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  // One soft disc, drawn once and blitted per particle. Shading a radial gradient per particle
  // cost 27 ms a frame at 828 particles (the bill lands inside getImageData, which waits for the
  // drawing to finish); a blit of the same disc is a tenth of that.
  const disc = document.createElement('canvas')
  const discContext = disc.getContext('2d')
  let discKey = ''
  let width = 0 // of the canvas bitmap, where all the pixel work happens
  let height = 0
  let scale = 1 // bitmap pixels per window pixel, 1 or less
  let highlightHeight = HIGHLIGHT_HEIGHT

  function resize (newWidth, newHeight) {
    scale = Math.min(1, Math.sqrt(PIXEL_BUDGET / (newWidth * newHeight)))
    width = canvas.width = Math.max(1, Math.round(newWidth * scale))
    height = canvas.height = Math.max(1, Math.round(newHeight * scale))
    canvas.style.width = `${newWidth}px`
    canvas.style.height = `${newHeight}px`
    highlightHeight = Math.max(1, Math.round(HIGHLIGHT_HEIGHT * scale))
  }

  // `flowAt(x, y)` gives the stirring velocity at a window point, drawn when look.showFlow is set.
  function render (state, count, flowAt) {
    const { r, g, b } = look.lavaColor
    const size = look.particleSize * scale
    prepareDisc(size, r, g, b)
    const span = disc.width
    const offset = span / 2
    context.clearRect(0, 0, width, height)
    for (let i = 0; i < count; i++) {
      context.drawImage(disc, state.x[i] * scale - offset, state.y[i] * scale - offset, span, span)
    }
    const imageData = context.getImageData(0, 0, width, height)
    const pix = imageData.data
    threshold(pix)
    highlight(pix, look.highlightColor)
    context.putImageData(imageData, 0, 0)
    if (look.showFlow && flowAt) drawFlow(flowAt)
  }

  // Wind map arrows: one per grid cell, pointing with the flow, as long as the flow is fast.
  function drawFlow (flowAt) {
    const step = FLOW_SPACING * scale
    const reach = step * 0.8
    const samples = []
    let fastest = 0
    for (let y = step / 2; y < height; y += step) {
      for (let x = step / 2; x < width; x += step) {
        const [vx, vy] = flowAt(x / scale, y / scale)
        const speed = Math.hypot(vx, vy)
        if (speed > fastest) fastest = speed
        samples.push(x, y, vx, vy, speed)
      }
    }
    if (fastest < 0.5) return
    context.strokeStyle = 'rgba(255, 255, 255, 0.6)'
    context.fillStyle = 'rgba(255, 255, 255, 0.6)'
    context.lineWidth = Math.max(1, 1.5 * scale)
    for (let k = 0; k < samples.length; k += 5) {
      const x = samples[k]
      const y = samples[k + 1]
      const vx = samples[k + 2]
      const vy = samples[k + 3]
      const speed = samples[k + 4]
      {
        if (speed < fastest * 0.02) continue
        const length = reach * speed / fastest
        const ux = vx / speed
        const uy = vy / speed
        const tipX = x + ux * length / 2
        const tipY = y + uy * length / 2
        context.beginPath()
        context.moveTo(x - ux * length / 2, y - uy * length / 2)
        context.lineTo(tipX, tipY)
        context.stroke()
        const head = Math.min(6 * scale, length / 2)
        context.beginPath()
        context.moveTo(tipX, tipY)
        context.lineTo(tipX - ux * head - uy * head / 2, tipY - uy * head + ux * head / 2)
        context.lineTo(tipX - ux * head + uy * head / 2, tipY - uy * head - ux * head / 2)
        context.closePath()
        context.fill()
      }
    }
  }

  // Redraw the disc when the size or colour changes: a radial gradient from solid at the centre
  // to transparent at the edge.
  function prepareDisc (size, r, g, b) {
    const key = `${size}/${r}/${g}/${b}`
    if (key === discKey) return
    discKey = key
    const span = Math.max(2, Math.ceil(size * 2))
    disc.width = disc.height = span
    const centre = span / 2
    const gradient = discContext.createRadialGradient(centre, centre, 0, centre, centre, size)
    gradient.addColorStop(0, `rgba(${r},${g},${b},1)`)
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`)
    discContext.clearRect(0, 0, span, span)
    discContext.beginPath()
    discContext.fillStyle = gradient
    discContext.arc(centre, centre, size, 0, Math.PI * 2)
    discContext.fill()
  }

  // Alpha above the threshold becomes solid, everything else transparent. Where discs overlap their
  // alphas add up, so two particles that are close enough fuse into one shape.
  function threshold (pix) {
    for (let i = 3; i < pix.length; i += 4) {
      pix[i] = pix[i] > ALPHA_THRESHOLD ? 255 : 0
    }
  }

  // Blend the highlight colour into the solid pixels above every bottom edge (a solid pixel whose
  // lower neighbour is transparent, or one sitting on the floor), strongest at the edge and fading
  // out over HIGHLIGHT_HEIGHT window pixels. Written flat over the byte array because it runs on
  // every pixel every frame.
  function highlight (pix, color) {
    const stride = width * 4
    const floorRow = height - 2
    const steps = highlightHeight
    for (let row = 0; row < height; row++) {
      const rowStart = row * stride
      const below = rowStart + stride
      const onFloor = row === floorRow
      for (let i = rowStart + 3; i < rowStart + stride; i += 4) {
        if (pix[i] !== 255) continue
        if (!onFloor && (row + 1 >= height || pix[i - rowStart + below] === 255)) continue
        for (let j = 0, k = i - 3; j < steps && k >= 0; j++, k -= stride) {
          if (pix[k + 3] !== 255) continue
          const keep = j / steps
          const mix = 1 - keep
          pix[k] = keep * pix[k] + mix * color.r
          pix[k + 1] = keep * pix[k + 1] + mix * color.g
          pix[k + 2] = keep * pix[k + 2] + mix * color.b
        }
      }
    }
  }

  return { render, resize }
}
