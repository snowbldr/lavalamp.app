// Device motion: a shake becomes a shove, and gravity decides which edge of the screen is down.
export function createMotionInput () {
  const acceleration = [0, 0]
  const gravity = [0, 1] // which way is down, in page coordinates (x right, y down), from the sensor
  let heard = false

  // Rotate a device-frame vector (x right, y up the screen) into page coordinates (x right, y down),
  // allowing for the browser having already turned the page to match the device.
  const toPage = (x, y) => {
    const angle = ((window.screen.orientation && window.screen.orientation.angle) || window.orientation || 0) * Math.PI / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    return [x * cos + y * sin, -(-x * sin + y * cos)]
  }

  window.addEventListener('devicemotion', event => {
    const a = event.acceleration
    if (a) {
      const [px, py] = toPage(a.x || 0, a.y || 0)
      acceleration[0] += px
      acceleration[1] += py
    }
    const g = event.accelerationIncludingGravity
    if (g && (g.x || g.y)) {
      // At rest this vector points away from the ground, so down is its opposite.
      const [px, py] = toPage(-(g.x || 0), -(g.y || 0))
      const length = Math.hypot(px, py)
      if (length > 3) { // a device lying flat has no opinion about down
        gravity[0] = px / length
        gravity[1] = py / length
        heard = true
      }
    }
  })

  return {
    // Returns and clears the acceleration gathered since the last call, in page coordinates.
    consume () {
      const result = [acceleration[0], acceleration[1]]
      acceleration[0] = 0
      acceleration[1] = 0
      return result
    },
    // The edge of the page that gravity points at: 'bottom', 'left', 'right' or 'top'. Only
    // changes edge when the sensor is clearly past the diagonal, so a tilt near 45 degrees does not
    // flap between two answers.
    downEdge (current = 'bottom') {
      if (!heard) return current
      const [x, y] = gravity
      const margin = 0.25
      if (Math.abs(x) > Math.abs(y) + margin) return x > 0 ? 'right' : 'left'
      if (Math.abs(y) > Math.abs(x) + margin) return y > 0 ? 'bottom' : 'top'
      return current
    },
    // iOS only delivers motion events after the page asks, and only from inside a user gesture.
    requestPermission () {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission().catch(() => {})
      }
    }
  }
}
