import { createCanvasRenderer } from './canvasRenderer.js'
import { createGlRenderer } from './glRenderer.js'

// The WebGL renderer wherever it works, the 2D canvas one otherwise. ?canvas in the URL forces
// the 2D one, for comparing the two pictures.
export function createRenderer (canvas, look) {
  const forced = new URLSearchParams(window.location.search).has('canvas')
  if (!forced) {
    try {
      const gl = createGlRenderer(canvas, look)
      if (gl) return gl
    } catch (err) {
      console.warn('WebGL renderer unavailable, using the 2D canvas', err)
    }
  }
  return createCanvasRenderer(canvas, look)
}
