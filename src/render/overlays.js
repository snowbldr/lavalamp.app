// The drawn-on-top views: the heater strip with its elements, and the flow field arrows. Shared
// by the WebGL renderer (on its overlay canvas) and the 2D canvas renderer.

export const HEAT_STOPS = ['heatCold', 'heatCool', 'heatWarm', 'heatHot', 'heatPeak']
const HEAT_STRIP = 10 // window px
// Arrows on a grid this many window pixels apart. Length saturates: the typical (median) speed
// on screen draws at half the cell, and the fastest tends toward most of it, so a tornado reads
// as the strongest thing without shrinking the roll around it to dots.
export const FLOW_SPACING = 40
const FLOW_ALPHA = 0.75
export const HEATER_CELL = 4 // lamp px per column of the heater strip

export const mix = (a, b, f) => [a.r + (b.r - a.r) * f, a.g + (b.g - a.g) * f, a.b + (b.b - a.b) * f].map(Math.round)

// The heat colour for t in [0, 1], interpolated along the five stops in `look`, each at its place
// in look.heatAt (0, Cool, Warm, Hot, 1; even when it is missing), set by the gradient's pins.
const EVEN_AT = [0, 0.25, 0.5, 0.75, 1]
export function heatColor (look, t) {
  const at = look.heatAt || EVEN_AT
  const u = Math.max(0, Math.min(1, t))
  let k = 0
  while (k < HEAT_STOPS.length - 2 && u > at[k + 1]) k++
  const span = at[k + 1] - at[k]
  return mix(look[HEAT_STOPS[k]], look[HEAT_STOPS[k + 1]], span > 0 ? Math.max(0, Math.min(1, (u - at[k]) / span)) : 0)
}

export const paletteKey = look => HEAT_STOPS.map(stop => { const c = look[stop]; return c ? `${c.r},${c.g},${c.b}` : '' }).join('/') + '@' + (look.heatAt || EVEN_AT).join(',')

// A strip along the floor coloured by the heater power under each column, with the heating
// elements sitting on it as half ellipses in their own proportions (footballs, three times wider
// than tall) at ELEMENT_SHOWN of their heating footprint, dark when off and up to white hot when
// lit. `scale` is bitmap pixels per window pixel.
const ELEMENT_SHOWN = 0.4
export function drawHeater (context, width, height, scale, look, heaterAt, elements) {
  const strip = Math.max(2, Math.round(HEAT_STRIP * scale))
  const cell = Math.max(1, Math.round(HEATER_CELL * scale))
  for (let x = 0; x < width; x += cell) {
    const [r, g, b] = heatColor(look, heaterAt((x + cell / 2) / scale) / 2)
    context.fillStyle = `rgb(${r},${g},${b})`
    context.fillRect(x, height - strip, cell, strip)
  }
  for (const el of elements) {
    const [r, g, b] = heatColor(look, 0.1 + 0.9 * el.glow)
    const rx = Math.max(6, el.halfWidth * ELEMENT_SHOWN * scale)
    const ry = Math.max(3, Math.min(el.radius * ELEMENT_SHOWN, 24) * scale) // a low dome, whatever the element's reach
    context.fillStyle = `rgb(${r},${g},${b})`
    context.beginPath()
    context.ellipse(el.x * scale, height - strip, rx, ry, 0, Math.PI, 0)
    context.fill()
  }
}

// The ceiling bottles' cooling, mirrored from the heater (Robert: "heater view should show
// cooling on the bottles"): a strip along the top edge and a low dome hanging under each bottle's
// mouth, icy blue as strong as the cooling is past the lamp's own (1 as tuned, CEILING_COOL in
// app.js at the music's fullest), nothing at 1.
const COOL_COLOR = [140, 205, 255]
export function drawCooling (context, width, scale, bottles, cool, coolMax = 5) {
  const f = Math.max(0, Math.min(1, (cool - 1) / Math.max(1e-6, coolMax - 1)))
  if (f <= 0) return
  const strip = Math.max(2, Math.round(HEAT_STRIP * scale))
  const [r, g, b] = COOL_COLOR
  context.fillStyle = `rgba(${r},${g},${b},${(0.25 + 0.6 * f).toFixed(3)})`
  context.fillRect(0, 0, width, strip)
  for (const bottle of bottles) {
    const rx = Math.max(6, bottle.w * scale)
    const ry = Math.max(3, Math.min(bottle.w * 0.5, 24) * scale)
    context.beginPath()
    context.ellipse(bottle.cx * scale, strip, rx, ry, 0, 0, Math.PI)
    context.fill()
  }
}

// Wind map arrows: one per grid cell, pointing with the flow, as long and as bright as the flow
// is fast, from look.flowSlow to look.flowFast.
const FLOW_HALF_SPEED = 60 // px/s: an arrow is half its full length and half way to the fast colour here
export function drawFlow (context, width, height, scale, look, flowAt) {
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
  const fastest = speeds[speeds.length - 1]
  if (fastest < 0.5) return
  // Against an absolute speed, not the frame's own median: with one eddy fading in an otherwise
  // still lamp the median was near zero and the eddy drew full length and full colour to its
  // last breath (Robert: "the arrows don't get shorter as it fades, still big long yellow
  // arrows"). Half length at FLOW_HALF_SPEED px/s.
  const typical = FLOW_HALF_SPEED
  const slow = look.flowSlow || { r: 255, g: 255, b: 255 }
  const fast = look.flowFast || slow
  context.lineWidth = 1
  for (let k = 0; k < samples.length; k += 5) {
    const x = samples[k]
    const y = samples[k + 1]
    const vx = samples[k + 2]
    const vy = samples[k + 3]
    const speed = samples[k + 4]
    if (speed < 1) continue
    const share = speed / (speed + typical) // 0 to 1, half at the typical speed
    const length = reach * share
    const [r, g, b] = mix(slow, fast, share)
    context.strokeStyle = context.fillStyle = `rgba(${r},${g},${b},${FLOW_ALPHA})`
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

// The Cups view's outlines: the ceiling and floor bottles (a line with a mouth per bottle, each
// bottle's flared neck and its bulb) and the edge of the screen as a dashed box, drawn in lamp
// coordinates (the caller has set the transform). The neck's flare is the simulation's: a
// quarter circle of radius r at the mouth and at the bulb.
export function drawCups (context, lampWidth, lampHeight, view, lineWidth) {
  context.lineWidth = lineWidth
  context.strokeStyle = 'rgba(236, 236, 236, 0.55)'
  for (const [bottles, fallbackY] of [[view.bottles || [], 0], [view.floorBottles || [], lampHeight]]) {
    if (!bottles.length) {
      context.beginPath()
      context.moveTo(0, fallbackY)
      context.lineTo(lampWidth, fallbackY)
      context.stroke()
      continue
    }
    const lineY = bottles[0].lineY
    const sorted = bottles.map((b, index) => ({ ...b, index })).sort((p, q) => p.cx - q.cx)
    context.beginPath()
    let at = 0
    for (const b of sorted) {
      const w = neckHalf(b, lineY)
      context.moveTo(at, lineY)
      context.lineTo(b.cx - w, lineY)
      at = b.cx + w
    }
    context.moveTo(at, lineY)
    context.lineTo(lampWidth, lineY)
    context.stroke()
    for (let index = 0; index < sorted.length; index++) {
      const b = sorted[index]
      // Walls sampled densely at both ends, where the fillets curve, so a rounded mouth does not
      // draw as a chamfer (Robert: "all the bottom ones have this weird lip artifact").
      const steps = 48
      const at = k => lineY + (b.neckEnd - lineY) * (1 - Math.cos(Math.PI * k / steps)) / 2
      // In the Heater view the floor bottles are the heaters: stroke each in its element's colour.
      const glow = view.glow && b.dir > 0 ? view.glow[b.index] : undefined
      if (glow !== undefined) {
        const [r, g, bl] = heatColor(view.look, 0.1 + 0.9 * glow)
        context.strokeStyle = `rgb(${r},${g},${bl})`
        context.lineWidth = lineWidth * (1 + 2 * glow)
      } else {
        context.strokeStyle = 'rgba(236, 236, 236, 0.55)'
        context.lineWidth = lineWidth
      }
      context.beginPath()
      // Left wall of the neck from the line to the bulb, then around the bulb, then the right wall back.
      for (let k = 0; k <= steps; k++) {
        const py = at(k)
        const px = b.cx - neckHalf(b, py)
        if (k === 0) context.moveTo(px, py)
        else context.lineTo(px, py)
      }
      // The bulb's outline from the neck's left join the long way round to its right join: the
      // shape's polar radius, sampled. Canvas angles run clockwise (y down); the join is straight
      // down from a ceiling bulb's centre and straight up from a floor bulb's.
      const angle = b.joinAngle !== undefined ? b.joinAngle : Math.asin(Math.min(1, b.w / b.R))
      const join = b.dir < 0 ? Math.PI / 2 : -Math.PI / 2
      const samples = 96
      const start = join + angle
      const sweep = Math.PI * 2 - 2 * angle // the long way round, increasing, for both rows
      for (let k = 0; k <= samples; k++) {
        const theta = start + sweep * k / samples
        const rr = b.radiusAt ? b.radiusAt(theta) : b.R
        context.lineTo(b.cx + Math.cos(theta) * rr, b.cy + Math.sin(theta) * rr)
      }
      for (let k = steps; k >= 0; k--) {
        const py = at(k)
        context.lineTo(b.cx + neckHalf(b, py), py)
      }
      context.stroke()
    }
    context.lineWidth = lineWidth
    context.strokeStyle = 'rgba(236, 236, 236, 0.55)'
  }
  context.setLineDash([6 * lineWidth, 6 * lineWidth])
  context.strokeStyle = 'rgba(236, 236, 236, 0.3)'
  context.strokeRect(0, 0, lampWidth, lampHeight)
  context.setLineDash([])
}

function neckHalf (b, py) {
  const t = Math.abs(py - b.lineY)
  const mouth = t < b.rm ? b.rm - Math.sqrt(Math.max(0, b.rm * b.rm - (b.rm - t) * (b.rm - t))) : 0
  const u = (py - b.yf) * b.dir
  const shoulder = u > 0 ? b.rs - Math.sqrt(Math.max(0, b.rs * b.rs - Math.min(u, b.rs) * Math.min(u, b.rs))) : 0
  return b.w + mouth + shoulder
}
