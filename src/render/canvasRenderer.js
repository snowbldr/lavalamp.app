const HIGHLIGHT_HEIGHT = 15
const ALPHA_THRESHOLD = 70
// The threshold and highlight passes touch every pixel in JavaScript, so the canvas has at most
// this many pixels and CSS stretches it to the window; the compositor does that scaling for free.
// One million is the 1000 x 1000 lamp the pass was written for. A 2560 x 1300 window at full
// resolution took 108 ms a frame. The stretch softens the blob edges by a pixel or two, which
// lava can afford.
const PIXEL_BUDGET = 1_000_000
// The flow overlay: arrows on a grid this many window pixels apart. Length saturates: the
// typical (median) speed on screen draws at half the cell, and the fastest tends toward most of
// it, so a tornado reads as the strongest thing without shrinking the roll around it to dots.
const FLOW_SPACING = 40
// The heat map: lava coloured by temperature on an infrared palette, neutral buoyancy in the
// middle, so purple is sinking and yellow is rising, with a strip along the floor for the heater.
const HEAT_STEPS = 48
const HEAT_STRIP = 10 // window px
const HEAT_PALETTE = [[20, 0, 60], [110, 0, 170], [220, 40, 40], [255, 170, 0], [255, 255, 230]]

// Draws the particles as soft discs, thresholds the alpha channel so that overlapping discs fuse
// into one blob (the classic metaball trick), then lights the underside of every blob with a short
// gradient, as if lit by the bulb below.
// `look` is a plain object the caller keeps up to date: { lavaColor, highlightColor, particleSize, showFlow, showHeat }
export function createCanvasRenderer (canvas, look) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  // One soft disc, drawn once and blitted per particle. Shading a radial gradient per particle
  // cost 27 ms a frame at 828 particles (the bill lands inside getImageData, which waits for the
  // drawing to finish); a blit of the same disc is a tenth of that.
  const disc = document.createElement('canvas')
  const discContext = disc.getContext('2d')
  let discKey = ''
  // Heat map discs, one per palette step, same size as the lava disc.
  const heatDiscs = []
  let heatKey = ''
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

  // `overlays` is { flowAt, heaterAt, elements, neutral }: the stirring velocity at a window point,
  // the heater power under a floor point, the heating elements, and the temperature of neutral buoyancy, for the flow field and heat
  // map when look.showFlow or look.showHeat is set. `state.temp` is needed for the heat map.
  function render (state, count, overlays = {}) {
    const { r, g, b } = look.lavaColor
    const size = look.particleSize * scale
    const heat = look.showHeat && state.temp && overlays.neutral > 0
    context.clearRect(0, 0, width, height)
    if (heat) {
      prepareHeatDiscs(size)
      const span = heatDiscs[0].width
      const offset = span / 2
      const top = HEAT_STEPS - 1
      const perTemp = top / (2 * overlays.neutral)
      for (let i = 0; i < count; i++) {
        const step = Math.max(0, Math.min(top, Math.round(state.temp[i] * perTemp)))
        context.drawImage(heatDiscs[step], state.x[i] * scale - offset, state.y[i] * scale - offset, span, span)
      }
    } else {
      prepareDisc(size, r, g, b)
      const span = disc.width
      const offset = span / 2
      for (let i = 0; i < count; i++) {
        context.drawImage(disc, state.x[i] * scale - offset, state.y[i] * scale - offset, span, span)
      }
    }
    const imageData = context.getImageData(0, 0, width, height)
    const pix = imageData.data
    threshold(pix)
    if (!heat) highlight(pix, look.highlightColor)
    context.putImageData(imageData, 0, 0)
    if (heat && overlays.heaterAt) drawHeater(overlays.heaterAt, overlays.elements ? overlays.elements() : [])
    if (look.showFlow && overlays.flowAt) drawFlow(overlays.flowAt)
  }

  // The infrared colour for t in [0, 1], interpolated along HEAT_PALETTE.
  function heatColor (t) {
    const pos = Math.max(0, Math.min(1, t)) * (HEAT_PALETTE.length - 1)
    const k = Math.min(HEAT_PALETTE.length - 2, Math.floor(pos))
    const f = pos - k
    const a = HEAT_PALETTE[k]
    const b = HEAT_PALETTE[k + 1]
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f].map(Math.round)
  }

  function prepareHeatDiscs (size) {
    const key = `${size}`
    if (key === heatKey) return
    heatKey = key
    const span = Math.max(2, Math.ceil(size * 2))
    heatDiscs.length = 0
    for (let step = 0; step < HEAT_STEPS; step++) {
      const [r, g, b] = heatColor(step / (HEAT_STEPS - 1))
      const c = document.createElement('canvas')
      c.width = c.height = span
      paintDisc(c.getContext('2d'), span, size, r, g, b)
      heatDiscs.push(c)
    }
  }

  // A strip along the floor coloured by the heater power under each column: dark where the
  // heater is off, white hot at the peak of the wave. Normal power sits at the middle of the palette.
  // The heating elements sit on the strip as domes, dark when off and up to white hot when lit.
  function drawHeater (heaterAt, elements) {
    const strip = Math.max(2, Math.round(HEAT_STRIP * scale))
    const cell = Math.max(1, Math.round(4 * scale))
    for (let x = 0; x < width; x += cell) {
      const power = heaterAt((x + cell / 2) / scale)
      const [r, g, b] = heatColor(power / 2)
      context.fillStyle = `rgb(${r},${g},${b})`
      context.fillRect(x, height - strip, cell, strip)
    }
    for (const el of elements) {
      const [r, g, b] = heatColor(0.1 + 0.9 * el.glow)
      const dome = Math.max(4, Math.min(el.radius * 0.3, 24) * scale)
      context.fillStyle = `rgb(${r},${g},${b})`
      context.beginPath()
      context.arc(el.x * scale, height - strip, dome, Math.PI, 0)
      context.fill()
    }
  }

  // Wind map arrows: one per grid cell, pointing with the flow, as long as the flow is fast.
  function drawFlow (flowAt) {
    const step = FLOW_SPACING * scale
    const reach = step * 0.8
    const samples = []
    const speeds = []
    for (let y = step / 2; y < height; y += step) {
      for (let x = step / 2; x < width; x += step) {
        const [vx, vy] = flowAt(x / scale, y / scale)
        const speed = Math.hypot(vx, vy)
        samples.push(x, y, vx, vy, speed)
        speeds.push(speed)
      }
    }
    speeds.sort((a, b) => a - b)
    const typical = speeds[speeds.length >> 1]
    const fastest = speeds[speeds.length - 1]
    if (fastest < 0.5) return
    context.strokeStyle = 'rgba(255, 255, 255, 0.6)'
    context.fillStyle = 'rgba(255, 255, 255, 0.6)'
    context.lineWidth = 1
    for (let k = 0; k < samples.length; k += 5) {
      const x = samples[k]
      const y = samples[k + 1]
      const vx = samples[k + 2]
      const vy = samples[k + 3]
      const speed = samples[k + 4]
      {
        if (speed < fastest * 0.02) continue
        const length = reach * speed / (speed + typical)
        const ux = vx / speed
        const uy = vy / speed
        const tipX = x + ux * length / 2
        const tipY = y + uy * length / 2
        context.beginPath()
        context.moveTo(x - ux * length / 2, y - uy * length / 2)
        context.lineTo(tipX, tipY)
        context.stroke()
        const head = Math.min(5 * scale, length / 2)
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
    paintDisc(discContext, span, size, r, g, b)
  }

  function paintDisc (target, span, size, r, g, b) {
    const centre = span / 2
    const gradient = target.createRadialGradient(centre, centre, 0, centre, centre, size)
    gradient.addColorStop(0, `rgba(${r},${g},${b},1)`)
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`)
    target.clearRect(0, 0, span, span)
    target.beginPath()
    target.fillStyle = gradient
    target.arc(centre, centre, size, 0, Math.PI * 2)
    target.fill()
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
