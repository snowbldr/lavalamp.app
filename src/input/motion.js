// Accumulates device acceleration between frames. The app hands it to the simulation once per step
// as a push, so a bump to the phone becomes a one-frame shove to the whole lamp.
export function createMotionInput () {
  const acceleration = [0, 0]

  window.addEventListener('devicemotion', event => {
    const a = event.acceleration
    if (!a) return
    acceleration[0] += a.x || 0
    acceleration[1] += a.y || 0
  })

  return {
    // Returns and clears the acceleration gathered since the last call.
    consume () {
      const result = [acceleration[0], acceleration[1]]
      acceleration[0] = 0
      acceleration[1] = 0
      return result
    },
    // iOS only delivers motion events after the page asks, and only from inside a user gesture.
    requestPermission () {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission().catch(() => {})
      }
    }
  }
}
