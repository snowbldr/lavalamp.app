// Tracks fingers and the mouse on the lamp. Each live pointer is reported once per frame with its
// lamp position and velocity; `toLamp` converts page coordinates into the lamp's frame, which
// matters once the lamp is rotated to follow gravity.
export function createPointerInput (element, toLamp) {
  const pointers = new Map()

  element.style.touchAction = 'none'
  element.addEventListener('pointerdown', event => {
    try { element.setPointerCapture(event.pointerId) } catch (e) { /* synthetic events have no pointer to capture */ }
    const [x, y] = toLamp(event.clientX, event.clientY)
    pointers.set(event.pointerId, { x, y, lastX: x, lastY: y, vx: 0, vy: 0 })
  })
  element.addEventListener('pointermove', event => {
    const p = pointers.get(event.pointerId)
    if (!p) return
    const [x, y] = toLamp(event.clientX, event.clientY)
    p.x = x
    p.y = y
  })
  const release = event => pointers.delete(event.pointerId)
  element.addEventListener('pointerup', release)
  element.addEventListener('pointercancel', release)
  element.addEventListener('lostpointercapture', release)

  return {
    // The live pointers with their velocity since the last call, in lamp px per second.
    consume (dt) {
      const result = []
      for (const p of pointers.values()) {
        p.vx = (p.x - p.lastX) / dt
        p.vy = (p.y - p.lastY) / dt
        p.lastX = p.x
        p.lastY = p.y
        result.push(p)
      }
      return result
    }
  }
}
