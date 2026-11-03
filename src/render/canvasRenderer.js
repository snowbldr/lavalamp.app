import { drawCups, drawFlow, drawHeater, heatColor as paletteColor, paletteKey } from './overlays.js'

const ALPHA_THRESHOLD = 70
// The threshold pass touches every pixel in JavaScript, so the canvas has at most
// this many pixels and CSS stretches it to the window; the compositor does that scaling for free.
// One million is the 1000 x 1000 lamp the pass was written for. A 2560 x 1300 window at full
// resolution took 108 ms a frame. The stretch softens the blob edges by a pixel or two, which
// lava can afford.
const PIXEL_BUDGET = 1_000_000
// The heat map: lava coloured by temperature on a five stop gradient from `look` (heatCold,
// heatCool, heatWarm, heatHot, heatPeak), neutral buoyancy in the middle, so with the default
// palette blue and green are sinking and red is rising. The heater strip and the flow arrows
// are drawn by overlays.js.
const HEAT_STEPS = 48

// Draws the particles as soft discs, thresholds the alpha channel so that overlapping discs fuse
// into one blob (the classic metaball trick), then lights the underside of every blob with a short
// gradient, as if lit by the bulb below.
// `look` is a plain object the caller keeps up to date: { lavaColor, particleSize,
// showFlow, showHeat, showHeater, heatCold, heatCool, heatWarm, heatHot, heatPeak, flowSlow, flowFast }
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
  let lampWidth = 0
  let lampHeight = 0
  let scale = 1 // bitmap pixels per window pixel, 1 or less

  function resize (newWidth, newHeight) {
    lampWidth = newWidth
    lampHeight = newHeight
    scale = Math.min(1, Math.sqrt(PIXEL_BUDGET / (newWidth * newHeight)))
    width = canvas.width = Math.max(1, Math.round(newWidth * scale))
    height = canvas.height = Math.max(1, Math.round(newHeight * scale))
    canvas.style.width = `${newWidth}px`
    canvas.style.height = `${newHeight}px`
  }

  // `overlays` is { flowAt, heaterAt, elements, neutral }: the stirring velocity at a window point,
  // the heater power under a floor point, the heating elements, and the temperature of neutral buoyancy, for the flow field and heat
  // map when look.showFlow or look.showHeat is set. `state.temp` is needed for the heat map.
  // Per-phase timings of the last frame in ms, kept up to date when look.profile is set.
  const profile = { discs: 0, read: 0, threshold: 0, write: 0, overlays: 0 }
  const now = () => (look.profile ? performance.now() : 0)

  function render (state, count, overlays = {}) {
    const { r, g, b } = look.lavaColor || { r: 0, g: 0, b: 0 }
    const view = overlays.view || { k: 1, ox: 0, oy: 0 }
    const size = look.particleSize * view.k * scale
    const heat = look.showHeat && state.temp && overlays.neutral > 0
    let t = now()
    context.clearRect(0, 0, width, height)
    if (heat) {
      prepareHeatDiscs(size)
      const span = heatDiscs[0].width
      const offset = span / 2
      const top = HEAT_STEPS - 1
      const perTemp = top / (2 * overlays.neutral)
      const floorY = overlays.floorY ?? Infinity // lava in a pot drawn no hotter than neutral (see glRenderer.js)
      for (let i = 0; i < count; i++) {
        const temp = state.y[i] > floorY ? Math.min(state.temp[i], overlays.neutral) : state.temp[i]
        const step = Math.max(0, Math.min(top, Math.round(temp * perTemp)))
        context.drawImage(heatDiscs[step], (state.x[i] * view.k + view.ox) * scale - offset, (state.y[i] * view.k + view.oy) * scale - offset, span, span)
      }
    } else {
      prepareDisc(size, r, g, b)
      const span = disc.width
      const offset = span / 2
      for (let i = 0; i < count; i++) {
        context.drawImage(disc, (state.x[i] * view.k + view.ox) * scale - offset, (state.y[i] * view.k + view.oy) * scale - offset, span, span)
      }
    }
    let t1 = now(); profile.discs = t1 - t; t = t1
    const imageData = context.getImageData(0, 0, width, height)
    const pix = imageData.data
    t1 = now(); profile.read = t1 - t; t = t1
    threshold(pix)
    t1 = now(); profile.threshold = t1 - t; t = t1
    context.putImageData(imageData, 0, 0)
    t1 = now(); profile.write = t1 - t; t = t1
    // The heater is its own view (Robert: "hide the heating elements by default, but add a switch to
    // show the heating element. should work independently of heat map").
    const k = view.k * scale
    context.setTransform(k, 0, 0, k, view.ox * scale, view.oy * scale)
    if (look.showHeater && overlays.heaterAt && !overlays.view) drawHeater(context, lampWidth, lampHeight, 1, look, overlays.heaterAt, overlays.elements ? overlays.elements() : [])
    if (look.showFlow && overlays.flowAt) drawFlow(context, lampWidth, lampHeight, 1, look, overlays.flowAt)
    if (overlays.view) drawCups(context, lampWidth, lampHeight, overlays.view, 1 / k)
    context.setTransform(1, 0, 0, 1, 0, 0)
    profile.overlays = now() - t
  }

  const heatColor = t => paletteColor(look, t)

  function prepareHeatDiscs (size) {
    const key = `${size}/${paletteKey(look)}`
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

  return { render, resize, profile, pixels: () => width * height }
}
