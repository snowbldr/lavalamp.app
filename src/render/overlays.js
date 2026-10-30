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
    const ry = Math.max(3, Math.min(el.radius * ELEMENT_SHOWN, 24) * scale) // a low dome, whatever the element's reach
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
    const sorted = [...bottles].sort((p, q) => p.cx - q.cx)
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
    for (const b of sorted) {
      const steps = 24
      context.beginPath()
      // Left wall of the neck from the line to the bulb, then around the bulb, then the right wall back.
      for (let k = 0; k <= steps; k++) {
        const py = lineY + (b.neckEnd - lineY) * k / steps
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
        const py = lineY + (b.neckEnd - lineY) * k / steps
        context.lineTo(b.cx + neckHalf(b, py), py)
      }
      context.stroke()
    }
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
