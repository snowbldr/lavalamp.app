// The drawn-on-top views: the heater strip with its elements, and the flow field arrows. Shared
// by the WebGL renderer (on its overlay canvas) and the 2D canvas renderer.

export const HEAT_STOPS = ['heatCold', 'heatCool', 'heatWarm', 'heatHot', 'heatPeak']
const HEAT_STRIP = 10 // window px
// Arrows on a grid this many window pixels apart. Length saturates: the typical (median) speed
// on screen draws at half the cell, and the fastest tends toward most of it, so a tornado reads
// as the strongest thing without shrinking the roll around it to dots.
const FLOW_SPACING = 40
const FLOW_ALPHA = 0.75

export const mix = (a, b, f) => [a.r + (b.r - a.r) * f, a.g + (b.g - a.g) * f, a.b + (b.b - a.b) * f].map(Math.round)

// The heat colour for t in [0, 1], interpolated along the five stops in `look`.
export function heatColor (look, t) {
  const pos = Math.max(0, Math.min(1, t)) * (HEAT_STOPS.length - 1)
  const k = Math.min(HEAT_STOPS.length - 2, Math.floor(pos))
  return mix(look[HEAT_STOPS[k]], look[HEAT_STOPS[k + 1]], pos - k)
}

export const paletteKey = look => HEAT_STOPS.map(stop => { const c = look[stop]; return c ? `${c.r},${c.g},${c.b}` : '' }).join('/')

// A strip along the floor coloured by the heater power under each column, with the heating
// elements sitting on it as half ellipses in their own proportions (footballs, three times wider
// than tall) at ELEMENT_SHOWN of their heating footprint, dark when off and up to white hot when
// lit. `scale` is bitmap pixels per window pixel.
const ELEMENT_SHOWN = 0.4
export function drawHeater (context, width, height, scale, look, heaterAt, elements) {
  const strip = Math.max(2, Math.round(HEAT_STRIP * scale))
  const cell = Math.max(1, Math.round(4 * scale))
  for (let x = 0; x < width; x += cell) {
    const [r, g, b] = heatColor(look, heaterAt((x + cell / 2) / scale) / 2)
    context.fillStyle = `rgb(${r},${g},${b})`
    context.fillRect(x, height - strip, cell, strip)
  }
  for (const el of elements) {
    const [r, g, b] = heatColor(look, 0.1 + 0.9 * el.glow)
    const rx = Math.max(6, el.halfWidth * ELEMENT_SHOWN * scale)
    const ry = Math.max(3, el.radius * ELEMENT_SHOWN * scale)
    context.fillStyle = `rgb(${r},${g},${b})`
    context.beginPath()
    context.ellipse(el.x * scale, height - strip, rx, ry, 0, Math.PI, 0)
    context.fill()
  }
}

// Wind map arrows: one per grid cell, pointing with the flow, as long and as bright as the flow
// is fast, from look.flowSlow to look.flowFast.
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
  const typical = speeds[speeds.length >> 1]
  const fastest = speeds[speeds.length - 1]
  if (fastest < 0.5) return
  const slow = look.flowSlow || { r: 255, g: 255, b: 255 }
  const fast = look.flowFast || slow
  context.lineWidth = 1
  for (let k = 0; k < samples.length; k += 5) {
    const x = samples[k]
    const y = samples[k + 1]
    const vx = samples[k + 2]
    const vy = samples[k + 3]
    const speed = samples[k + 4]
    if (speed < fastest * 0.02) continue
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

// The Cups view's outlines: the ceiling and floor surfaces, and the edge of the screen as a dashed
// box, drawn in lamp coordinates (the caller has set the transform).
export function drawCups (context, lampWidth, lampHeight, view, lineWidth) {
  context.lineWidth = lineWidth
  context.strokeStyle = 'rgba(236, 236, 236, 0.55)'
  // The floor.
  context.beginPath()
  for (let px = 0; px <= lampWidth; px += 4) {
    const py = view.floorAt(px)
    if (px === 0) context.moveTo(px, py)
    else context.lineTo(px, py)
  }
  context.stroke()
  // The ceiling: the lip line with a mouth per bottle, and each bottle's neck and bulb.
  const bottles = view.bottles || []
  if (bottles.length) {
    const lipY = bottles[0].lipY
    const sorted = [...bottles].sort((p, q) => p.cx - q.cx)
    context.beginPath()
    let at = 0
    for (const b of sorted) {
      context.moveTo(at, lipY)
      context.lineTo(b.cx - b.w, lipY)
      at = b.cx + b.w
    }
    context.moveTo(at, lipY)
    context.lineTo(lampWidth, lipY)
    context.stroke()
    for (const b of sorted) {
      const angle = Math.asin(Math.min(1, b.w / b.R)) // from straight down to the neck junction
      context.beginPath()
      context.moveTo(b.cx - b.w, lipY)
      context.lineTo(b.cx - b.w, b.neckTop)
      context.arc(b.cx, b.cy, b.R, Math.PI / 2 + angle, Math.PI / 2 - angle, false)
      context.lineTo(b.cx + b.w, lipY)
      context.stroke()
    }
  } else {
    context.beginPath()
    context.moveTo(0, view.ceilingAt(0))
    context.lineTo(lampWidth, view.ceilingAt(lampWidth))
    context.stroke()
  }
  context.setLineDash([6 * lineWidth, 6 * lineWidth])
  context.strokeStyle = 'rgba(236, 236, 236, 0.3)'
  context.strokeRect(0, 0, lampWidth, lampHeight)
  context.setLineDash([])
}
