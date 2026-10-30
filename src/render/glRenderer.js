import { drawFlow, drawHeater, heatColor, paletteKey } from './overlays.js'

// The metaball pass on the GPU. Same picture as canvasRenderer.js, which it replaces wherever
// WebGL exists: soft discs composited source-over into a texture, then one fullscreen pass
// thresholds the alpha so the discs fuse and lights the underside of every blob by looking up
// to HIGHLIGHT_HEIGHT pixels down for a bottom edge. Nothing is read back: the 2D version spent
// 4.8 ms of a 9.7 ms frame in getImageData and another 1.9 in a JavaScript threshold pass on
// Robert's Mac, and a phone has far less to spend. Flow arrows and the heater strip, which are
// line drawing, go on a transparent 2D canvas laid over this one.
const HIGHLIGHT_HEIGHT = 15
const ALPHA_THRESHOLD = 70 // of 255, as in the canvas renderer
// The same pixel budget as the canvas renderer, for the same look: the GPU could draw the window
// at full resolution for free, but the stretch softens the blob edges by a pixel or two and that
// softness is part of how the lamp looks.
const PIXEL_BUDGET = 1_000_000
const HEAT_STEPS = 48
const MAX_HIGHLIGHT = 32 // shader loop bound, in bitmap pixels

const PARTICLE_VERTEX = `
attribute vec2 aCentre;
attribute vec2 aCorner;
attribute vec3 aColor;
uniform vec2 uResolution;
uniform float uSize;
varying vec2 vCorner;
varying vec3 vColor;
void main () {
  vec2 p = aCentre + aCorner * uSize;
  vec2 clip = vec2(p.x / uResolution.x * 2.0 - 1.0, 1.0 - p.y / uResolution.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  vCorner = aCorner;
  vColor = aColor;
}`
// Alpha falls linearly from 1 at the centre to 0 at the edge, like the canvas radial gradient.
const PARTICLE_FRAGMENT = `
precision mediump float;
varying vec2 vCorner;
varying vec3 vColor;
void main () {
  float a = max(0.0, 1.0 - length(vCorner));
  gl_FragColor = vec4(vColor * a, a);
}`
const QUAD_VERTEX = `
attribute vec2 aPosition;
varying vec2 vUv;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`
// Threshold, then highlight: a pixel j below this one that is solid with a transparent pixel (or
// the floor row) under it is a bottom edge, and this pixel takes 1 - j / steps of the highlight
// colour from the lowest such edge within reach, which is what the canvas pass painted.
const COMPOSITE_FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uAccum;
uniform vec2 uTexel;
uniform float uThreshold;
uniform vec3 uLava;
uniform vec3 uHighlight;
uniform float uSteps;
uniform float uHeat;
uniform float uRows;
void main () {
  vec4 c = texture2D(uAccum, vUv);
  if (c.a <= uThreshold) { gl_FragColor = vec4(0.0); return; }
  vec3 rgb = uHeat > 0.5 ? c.rgb / c.a : uLava;
  if (uHeat < 0.5) {
    float amount = 0.0;
    for (int j = 0; j < ${MAX_HIGHLIGHT}; j++) {
      if (float(j) >= uSteps) break;
      float vj = vUv.y - float(j) * uTexel.y;
      if (vj < 0.0) break;
      float here = texture2D(uAccum, vec2(vUv.x, vj)).a;
      if (here <= uThreshold) continue;
      float row = floor(vj * uRows); // from the bottom; row 1 is the floor row of the canvas pass
      float below = texture2D(uAccum, vec2(vUv.x, vj - uTexel.y)).a;
      if (row == 1.0 || (row > 1.0 && below <= uThreshold)) amount = 1.0 - float(j) / uSteps;
    }
    rgb = mix(rgb, uHighlight, amount);
  }
  gl_FragColor = vec4(rgb, 1.0);
}`

export function createGlRenderer (canvas, look) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false })
  if (!gl) return null

  const compile = (type, source) => {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader))
    return shader
  }
  const link = (vertex, fragment) => {
    const program = gl.createProgram()
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
    return program
  }
  const particles = link(PARTICLE_VERTEX, PARTICLE_FRAGMENT)
  const composite = link(QUAD_VERTEX, COMPOSITE_FRAGMENT)
  const loc = (program, names) => {
    const out = {}
    for (const n of names) out[n] = n[0] === 'a' ? gl.getAttribLocation(program, n) : gl.getUniformLocation(program, n)
    return out
  }
  const pLoc = loc(particles, ['aCentre', 'aCorner', 'aColor', 'uResolution', 'uSize'])
  const cLoc = loc(composite, ['aPosition', 'uAccum', 'uTexel', 'uThreshold', 'uLava', 'uHighlight', 'uSteps', 'uHeat', 'uRows'])

  // Particle vertices: six per particle, each centre x, y, corner x, y, colour r, g, b.
  const STRIDE = 7
  let vertexData = new Float32Array(0)
  const vertexBuffer = gl.createBuffer()
  const quadBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)

  // The accumulation texture and its framebuffer, resized with the canvas.
  const accum = gl.createTexture()
  const framebuffer = gl.createFramebuffer()
  gl.bindTexture(gl.TEXTURE_2D, accum)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  // The overlay: a transparent 2D canvas over this one for the arrows and the heater, following
  // the lamp's size and turn.
  const overlay = document.createElement('canvas')
  const overlayContext = overlay.getContext('2d')
  Object.assign(overlay.style, { position: 'absolute', left: '50%', top: '50%', pointerEvents: 'none', transition: 'transform 0.4s' })
  let overlayShown = false

  // Heat colours per temperature step, rebuilt when the palette changes.
  const heatTable = new Float32Array(HEAT_STEPS * 3)
  let heatKey = ''

  let width = 0
  let height = 0
  let scale = 1
  const profile = { discs: 0, composite: 0, overlays: 0 }
  const now = () => (look.profile ? performance.now() : 0)

  function resize (newWidth, newHeight) {
    scale = Math.min(1, Math.sqrt(PIXEL_BUDGET / (newWidth * newHeight)))
    width = canvas.width = Math.max(1, Math.round(newWidth * scale))
    height = canvas.height = Math.max(1, Math.round(newHeight * scale))
    canvas.style.width = `${newWidth}px`
    canvas.style.height = `${newHeight}px`
    overlay.width = width
    overlay.height = height
    overlay.style.width = canvas.style.width
    overlay.style.height = canvas.style.height
    gl.bindTexture(gl.TEXTURE_2D, accum)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, accum, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  function prepareHeatTable () {
    const key = paletteKey(look)
    if (key === heatKey) return
    heatKey = key
    for (let step = 0; step < HEAT_STEPS; step++) {
      const [r, g, b] = heatColor(look, step / (HEAT_STEPS - 1))
      heatTable[step * 3] = r / 255
      heatTable[step * 3 + 1] = g / 255
      heatTable[step * 3 + 2] = b / 255
    }
  }

  function render (state, count, overlays = {}) {
    const heat = look.showHeat && state.temp && overlays.neutral > 0
    let t = now()
    // Pass 1: the discs, into the accumulation texture.
    const floats = count * 6 * STRIDE
    if (vertexData.length < floats) vertexData = new Float32Array(floats)
    const { r, g, b } = look.lavaColor
    const lava = [r / 255, g / 255, b / 255]
    if (heat) prepareHeatTable()
    const top = HEAT_STEPS - 1
    const perTemp = heat ? top / (2 * overlays.neutral) : 0
    let k = 0
    for (let i = 0; i < count; i++) {
      const cx = state.x[i] * scale
      const cy = state.y[i] * scale
      let cr = lava[0]
      let cg = lava[1]
      let cb = lava[2]
      if (heat) {
        const step = Math.max(0, Math.min(top, Math.round(state.temp[i] * perTemp))) * 3
        cr = heatTable[step]
        cg = heatTable[step + 1]
        cb = heatTable[step + 2]
      }
      // Two triangles: (-1,-1) (1,-1) (1,1) and (-1,-1) (1,1) (-1,1).
      for (const [ox, oy] of CORNERS) {
        vertexData[k++] = cx
        vertexData[k++] = cy
        vertexData[k++] = ox
        vertexData[k++] = oy
        vertexData[k++] = cr
        vertexData[k++] = cg
        vertexData[k++] = cb
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(particles)
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertexData.subarray(0, floats), gl.DYNAMIC_DRAW)
    const bytes = STRIDE * 4
    gl.enableVertexAttribArray(pLoc.aCentre)
    gl.vertexAttribPointer(pLoc.aCentre, 2, gl.FLOAT, false, bytes, 0)
    gl.enableVertexAttribArray(pLoc.aCorner)
    gl.vertexAttribPointer(pLoc.aCorner, 2, gl.FLOAT, false, bytes, 8)
    gl.enableVertexAttribArray(pLoc.aColor)
    gl.vertexAttribPointer(pLoc.aColor, 3, gl.FLOAT, false, bytes, 16)
    gl.uniform2f(pLoc.uResolution, width, height)
    gl.uniform1f(pLoc.uSize, look.particleSize * scale)
    gl.drawArrays(gl.TRIANGLES, 0, count * 6)
    gl.disableVertexAttribArray(pLoc.aColor)
    gl.disableVertexAttribArray(pLoc.aCorner)
    let t1 = now(); profile.discs = t1 - t; t = t1
    // Pass 2: threshold and highlight, to the screen.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, width, height)
    gl.disable(gl.BLEND)
    gl.useProgram(composite)
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
    gl.enableVertexAttribArray(cLoc.aPosition)
    gl.vertexAttribPointer(cLoc.aPosition, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, accum)
    gl.uniform1i(cLoc.uAccum, 0)
    gl.uniform2f(cLoc.uTexel, 1 / width, 1 / height)
    gl.uniform1f(cLoc.uThreshold, (ALPHA_THRESHOLD + 0.5) / 255)
    gl.uniform3f(cLoc.uLava, lava[0], lava[1], lava[2])
    const hl = look.highlightColor
    gl.uniform3f(cLoc.uHighlight, hl.r / 255, hl.g / 255, hl.b / 255)
    gl.uniform1f(cLoc.uSteps, Math.min(MAX_HIGHLIGHT, Math.max(1, Math.round(HIGHLIGHT_HEIGHT * scale))))
    gl.uniform1f(cLoc.uHeat, heat ? 1 : 0)
    gl.uniform1f(cLoc.uRows, height)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    t1 = now(); profile.composite = t1 - t; t = t1
    // The overlay canvas: only touched while a drawn-on-top view is on.
    const wantOverlay = (look.showHeater && overlays.heaterAt) || (look.showFlow && overlays.flowAt)
    if (wantOverlay) {
      if (!overlayShown) {
        canvas.parentNode.insertBefore(overlay, canvas.nextSibling)
        overlayShown = true
      }
      const turn = canvas.style.transform || ''
      const wanted = `translate(-50%, -50%) ${turn}`
      if (overlay.style.transform !== wanted) overlay.style.transform = wanted
      overlayContext.clearRect(0, 0, width, height)
      if (look.showHeater && overlays.heaterAt) drawHeater(overlayContext, width, height, scale, look, overlays.heaterAt, overlays.elements ? overlays.elements() : [])
      if (look.showFlow && overlays.flowAt) drawFlow(overlayContext, width, height, scale, look, overlays.flowAt)
    } else if (overlayShown) {
      overlay.remove()
      overlayShown = false
    }
    profile.overlays = now() - t
  }

  return { render, resize, profile, pixels: () => width * height, kind: 'webgl' }
}

const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]
