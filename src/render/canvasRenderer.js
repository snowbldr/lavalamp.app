const HIGHLIGHT_HEIGHT = 15
const ALPHA_THRESHOLD = 70

// Draws the particles as soft discs into a scratch canvas, thresholds the alpha channel so that
// overlapping discs fuse into one blob (the classic metaball trick), then lights the underside of
// every blob with a short gradient, as if lit by the bulb below.
// `look` is a plain object the caller keeps up to date: { lavaColor, highlightColor, particleSize }
export function createCanvasRenderer (canvas, look) {
  const context = canvas.getContext('2d')
  const scratch = document.createElement('canvas')
  const scratchContext = scratch.getContext('2d', { willReadFrequently: true })
  let width = 0
  let height = 0

  function resize (newWidth, newHeight) {
    width = canvas.width = scratch.width = newWidth
    height = canvas.height = scratch.height = newHeight
  }

  function render (state, count) {
    const { r, g, b } = look.lavaColor
    const size = look.particleSize
    for (let i = 0; i < count; i++) {
      drawParticle(state.x[i], state.y[i], size, r, g, b)
    }
    const imageData = scratchContext.getImageData(0, 0, width, height)
    const pix = imageData.data
    threshold(pix)
    highlight(pix, look.highlightColor)
    context.putImageData(imageData, 0, 0)
    scratchContext.clearRect(0, 0, width, height)
  }

  function drawParticle (x, y, size, r, g, b) {
    const gradient = scratchContext.createRadialGradient(x, y, 0, x, y, size)
    gradient.addColorStop(0, `rgba(${r},${g},${b},1)`)
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`)
    scratchContext.beginPath()
    scratchContext.fillStyle = gradient
    scratchContext.arc(x, y, size, 0, Math.PI * 2)
    scratchContext.fill()
  }

  // Alpha above the threshold becomes solid, everything else transparent. Where discs overlap their
  // alphas add up, so two particles that are close enough fuse into one shape.
  function threshold (pix) {
    for (let i = 3; i < pix.length; i += 4) {
      pix[i] = pix[i] > ALPHA_THRESHOLD ? 255 : 0
    }
  }

  const index = (row, col) => (row * width + col) * 4

  const isSolid = (pix, row, col) => pix[index(row, col) + 3] === 255

  // A solid pixel whose lower neighbour is transparent, or one sitting on the floor.
  const isBottomEdge = (pix, row, col) =>
    (row + 1 < height && !isSolid(pix, row + 1, col)) || row === height - 2

  // Blend the highlight colour into the solid pixels above every bottom edge, strongest at the
  // edge and fading out over HIGHLIGHT_HEIGHT pixels.
  function highlight (pix, color) {
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        if (!isSolid(pix, row, col) || !isBottomEdge(pix, row, col)) continue
        for (let j = 0; j < HIGHLIGHT_HEIGHT && row - j >= 0; j++) {
          const i = index(row - j, col)
          if (pix[i + 3] !== 255) continue
          blend(pix, i, j / HIGHLIGHT_HEIGHT, color)
        }
      }
    }
  }

  // Mix `color` into the pixel at i. keep = 0 is all colour, keep = 1 leaves the pixel alone.
  function blend (pix, i, keep, color) {
    const mix = 1 - keep
    pix[i] = keep * pix[i] + mix * color.r
    pix[i + 1] = keep * pix[i + 1] + mix * color.g
    pix[i + 2] = keep * pix[i + 2] + mix * color.b
  }

  return { render, resize }
}
