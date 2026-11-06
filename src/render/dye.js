// The Dyed fluid view (settings.js dyedFluid): a dye carried through the water by the lamp's own flow,
// drawn under the lava, over it as smoke, or alone. Robert, watching very spread out particles: "I
// could see all the liquid plumes and stuff, looks like watching radar, super cool"; of a WebGL fluid
// demo, "I really like this one" but "that one is missing the reactivity"; "we can add that as a layer
// on top of the lavalamp? like with another switch for something like, 'dyed fluid'?".
//
// The dye is a pair of ping pong textures at DYE_SCALE of the lamp's bitmap a side (a quarter of its
// pixels). Each frame:
//   advect  every dye texel takes the dye from where the flow says it came from (semi Lagrangian),
//           read through the velocity grid (dyeField.js: the Flow switch's field plus the particles'
//           own velocities), and keeps (1 - Fade) of it per second. Curve makes a texel's fade depend on its
//           own strength (its alpha, the dye laid there): at full strength it keeps (1 - Fade) a second, and
//           the weaker it gets the faster it goes, the keep raised to 1 + Curve * CURVE_SPAN * (1 - alpha), so
//           a bright head holds and its dim tail drops away; Tail cut then takes a fixed amount off every
//           texel a second, linearly, which ends a tail cleanly (Robert: "we have fade which makes the
//           streamers softer or stronger, but it seems linear. It'd probably look better if it dropped on a
//           gradient, then I could have a stronger initial glow without increasing the length of the tails
//           too much"). Curve 0 and Tail cut 0 are the fade as it was, exactly.
//   stamp   every drawn particle lays its heat colour from the lamp's palette at a small radius, from
//           the very vertex buffer the metaball pass just drew (no second walk over the particles),
//           at Stamp strength, so hot plumes leave bright streaks and cold lava dark wakes. A particle
//           lays a stroke from where it was drawn the frame before to where it is drawn now, not a
//           disc where it is: a fast drop moved up to 28 px a frame against a 5 px stamp and left a
//           string of beads (Robert: "the streamers leave a dotted trail instead of a smooth line").
//           The colour and the strength come from the lava as just drawn (the metaball field after the
//           Smooth blur) at the particle's centre, not from the particle alone: its colour is the
//           field's, and its strength the field's cover there, so a particle inside the lava lays the
//           lava's own smooth colour at full Stamp and a lone particle thrown off it lays only what the
//           blur leaves of it. Each laying its own heat colour at full strength, a high Stamp showed the
//           particles one by one (Robert: "when stamp is set high it makes the image rather grainy")
//   draw    the dye to the screen, before the lava (Under, Alone) or over it (Over), at Glow times the mode's
//           gain; over the gain the brightness bends softly towards full (dye.js DRAW_FRAGMENT), so a strong
//           Glow brightens the heads without clipping them flat. Glow 1 is the draw as it was, exactly.
// A view only: it reads the flow and the particles and writes nothing back to the simulation (Robert:
// "I would expect the motion to still be the same and for the dye to track the motion"). Off, nothing
// is allocated and no pass runs.
import { DYE_MAX_SPEED } from './dyeField.js'

export const DYE_SCALE = 0.5 // of the lamp's bitmap a side
export const DYE_STAMP_PX = 5 // a stamp's radius in lamp px
const OVER_GAIN = 0.45 // Over: the dye drawn faint, as smoke over the lava
const UNDER_GAIN = 0.6 // Under: dimmer than the lava, so the lava still reads as the lava over its own glow
const CURVE_SPAN = 6 // Curve 1: a texel with no dye left fades at 1 + 6 times the rate of a full one
const GLOW_KNEE = 0.75 // Glow's soft knee starts at the mode's own gain, or here if that is higher (Alone's 1)

const ADVECT_FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uDye;
uniform sampler2D uVel;
uniform vec2 uLamp;
uniform vec3 uView;
uniform vec2 uCells;
uniform float uCell;
uniform float uDt;
uniform float uKeep;
uniform float uLogKeep; // log2(uKeep), at least -20, so Curve's power is an exp2 and never pow(0, x)
uniform float uCurve;
uniform float uFloor;
// A cell's velocity from its four bytes (dyeField.js encode), so the grid is read nearest and filtered here: a byte
// pair filtered by the texture unit would mix the high and low bytes apart.
vec2 decode (vec4 c) {
  vec4 b = floor(c * 255.0 + 0.5);
  return (vec2(b.r, b.b) - 128.0 + vec2(b.g, b.a) / 256.0) / 128.0 * ${DYE_MAX_SPEED.toFixed(1)};
}
vec2 velocityAt (vec2 lamp) {
  vec2 f = lamp / uCell - 0.5;
  vec2 i = floor(f);
  vec2 t = f - i;
  vec2 uv = (i + 0.5) / uCells;
  vec2 d = 1.0 / uCells;
  vec2 a = mix(decode(texture2D(uVel, uv)), decode(texture2D(uVel, uv + vec2(d.x, 0.0))), t.x);
  vec2 b = mix(decode(texture2D(uVel, uv + vec2(0.0, d.y))), decode(texture2D(uVel, uv + d)), t.x);
  return mix(a, b, t.y);
}
void main () {
  vec2 screen = vec2(vUv.x * uLamp.x, (1.0 - vUv.y) * uLamp.y);
  vec2 lamp = (screen - uView.yz) / uView.x;
  vec2 v = velocityAt(lamp);
  vec2 d = v * uView.x * uDt;
  vec2 back = vUv - vec2(d.x / uLamp.x, -d.y / uLamp.y);
  vec4 dye = texture2D(uDye, back);
  float keep = uKeep;
  if (uCurve > 0.0) keep = exp2(uLogKeep * (1.0 + uCurve * ${CURVE_SPAN.toFixed(1)} * (1.0 - clamp(dye.a, 0.0, 1.0))));
  gl_FragColor = max(vec4(0.0), dye * keep - uFloor);
}`
// The stroke: a quad over the capsule from the particle's last drawn centre (aPrev) to this one (aCentre), uSize
// round, in the lamp's bitmap px. Under a stamp's radius of travel it is the old disc at the centre. Longer, it is
// the disc's cone summed at taps half a radius apart along the way, each weighted by its share of the length over
// the radius, so the middle of a stroke is 1 at any speed (the cone's integral across its centre is the radius) and
// this frame's stroke ending at a centre and the next one starting there add to 1 too: an even line, no bead at the
// joins. The tap at each end is half a step in, so neither end is counted twice.
const STAMP_TAPS = 16
const STAMP_VERTEX = `
attribute vec2 aCentre;
attribute vec2 aPrev;
attribute vec2 aCorner;
attribute vec3 aColor;
uniform vec2 uResolution;
uniform mediump float uSize; // as the fragment shader has it
varying vec2 vRel;
varying vec2 vSeg;
varying vec3 vColor;
varying vec2 vField;
void main () {
  vec2 seg = aCentre - aPrev;
  float len = length(seg);
  vec2 u = len > 0.001 ? seg / len : vec2(1.0, 0.0);
  vec2 w = vec2(-u.y, u.x);
  vec2 p = (aCentre + aPrev) * 0.5 + u * aCorner.x * (len * 0.5 + uSize) + w * aCorner.y * uSize;
  gl_Position = vec4(p.x / uResolution.x * 2.0 - 1.0, 1.0 - p.y / uResolution.y * 2.0, 0.0, 1.0);
  vRel = p - aCentre;
  vSeg = seg;
  vColor = aColor;
  vField = vec2(aCentre.x / uResolution.x, 1.0 - aCentre.y / uResolution.y);
}`
const STAMP_FRAGMENT = `
precision mediump float;
varying vec2 vRel;
varying vec2 vSeg;
varying vec3 vColor;
varying vec2 vField;
uniform sampler2D uField;
uniform float uSize;
uniform float uStamp;
void main () {
  vec4 f = texture2D(uField, vField);
  float cover = clamp(f.a, 0.0, 1.0);
  vec3 color = f.a > 0.004 ? f.rgb / f.a : vColor;
  float len = length(vSeg);
  float a;
  if (len < uSize) {
    a = max(0.0, 1.0 - length(vRel) / uSize);
  } else {
    float n = min(${STAMP_TAPS}.0, ceil(len / (0.5 * uSize)));
    float s = 0.0;
    for (int j = 0; j < ${STAMP_TAPS}; j++) {
      if (float(j) >= n) break;
      s += max(0.0, 1.0 - length(vRel + vSeg * ((float(j) + 0.5) / n)) / uSize);
    }
    a = min(1.0, s * len / (n * uSize));
  }
  a *= uStamp * cover;
  gl_FragColor = vec4(color * a, a);
}`
const DRAW_FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uDye;
uniform float uGain;
uniform float uGlow;
uniform float uKnee;
// Glow scales the dye's strength (its alpha, premultiplied, so the colour scales with it); up to the knee as is, over
// it bent towards 1 with the same slope at the knee, so no edge, and the colour kept by scaling all four channels alike.
void main () {
  vec4 c = texture2D(uDye, vUv) * uGain;
  if (uGlow != 1.0) {
    float t = c.a * uGlow;
    float s = t <= uKnee ? t : uKnee + (1.0 - uKnee) * (1.0 - exp((uKnee - t) / (1.0 - uKnee)));
    c *= c.a > 0.0001 ? s / c.a : uGlow;
  }
  gl_FragColor = min(vec4(1.0), c);
}`

export function createDye (gl, { link, quadVertex, quadBuffer, stride }) {
  const halfFloat = gl.getExtension('OES_texture_half_float')
  const halfLinear = gl.getExtension('OES_texture_half_float_linear')
  const halfTarget = halfFloat && halfLinear && gl.getExtension('EXT_color_buffer_half_float')
  let programs = null
  let targets = null // [{ texture, framebuffer }, ...], the dye ping pong
  let velocity = null
  let dw = 0
  let dh = 0
  let half = false
  let current = 0
  let lastAt = 0

  const locate = (program, names) => Object.fromEntries(names.map(n => [n, n[0] === 'a' ? gl.getAttribLocation(program, n) : gl.getUniformLocation(program, n)]))
  function ensurePrograms () {
    if (programs) return
    const advect = link(quadVertex, ADVECT_FRAGMENT)
    const stamp = link(STAMP_VERTEX, STAMP_FRAGMENT)
    const draw = link(quadVertex, DRAW_FRAGMENT)
    programs = {
      advect, aLoc: locate(advect, ['aPosition', 'uDye', 'uVel', 'uLamp', 'uView', 'uCells', 'uCell', 'uDt', 'uKeep', 'uLogKeep', 'uCurve', 'uFloor']),
      stamp, sLoc: locate(stamp, ['aCentre', 'aPrev', 'aCorner', 'aColor', 'uResolution', 'uSize', 'uStamp', 'uField']),
      draw, dLoc: locate(draw, ['aPosition', 'uDye', 'uGain', 'uGlow', 'uKnee'])
    }
  }
  const texture = filter => {
    const t = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }
  function ensureTargets (w, h) {
    if (targets && w === dw && h === dh) return
    dispose(true)
    dw = w; dh = h
    targets = [0, 1].map(() => ({ texture: texture(gl.LINEAR), framebuffer: gl.createFramebuffer() }))
    // Half floats where they can be rendered to and filtered, so the slow fade keeps its levels; 8 bit
    // otherwise, with a floor taken off each frame so a faint dye still reaches nothing.
    half = false
    for (const t of targets) {
      gl.bindTexture(gl.TEXTURE_2D, t.texture)
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.framebuffer)
      let ok = false
      if (halfTarget) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, halfFloat.HALF_FLOAT_OES, null)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.texture, 0)
        ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
      }
      if (!ok) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.texture, 0)
      }
      half = ok
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
    velocity = texture(gl.NEAREST) // 16 bit velocities in byte pairs, filtered in the shader (ADVECT_FRAGMENT)
    current = 0
    lastAt = 0
  }
  // keepPrograms: a resize only; off drops everything.
  function dispose (keepPrograms = false) {
    if (targets) for (const t of targets) { gl.deleteTexture(t.texture); gl.deleteFramebuffer(t.framebuffer) }
    if (velocity) gl.deleteTexture(velocity)
    targets = null
    velocity = null
    dw = dh = 0
    if (!keepPrograms && programs) {
      gl.deleteProgram(programs.advect); gl.deleteProgram(programs.stamp); gl.deleteProgram(programs.draw)
      programs = null
    }
  }

  // After the metaball pass has filled vertexBuffer with this frame's drawn particles. bitmap: the
  // lamp's bitmap size; lamp: the lamp px it shows; view: { k, ox, oy }; field: dyeField.js's grid;
  // dt: the lamp's own seconds this frame (pace and all), for the advection; fade, curve, cut, stamp: the knobs (cut a
  // second, on top of the precision floor); prevBuffer:
  // each vertex's particle centre as drawn the frame before (glRenderer.js), the stroke's start; lava: the metaball
  // field as the composite reads its colour (premultiplied, the lamp's bitmap size), for the stamp's colour and cover.
  function step ({ width, height, lampWidth, lampHeight, scale, view, field, dt, fade, curve = 0, cut = 0, stamp, vertexBuffer, prevBuffer, drawn, lava }) {
    ensurePrograms()
    ensureTargets(Math.max(1, Math.round(width * DYE_SCALE)), Math.max(1, Math.round(height * DYE_SCALE)))
    const at = performance.now()
    const wall = lastAt ? Math.min(0.1, Math.max(0, (at - lastAt) / 1000)) : 1 / 60
    lastAt = at
    const { aLoc, sLoc } = programs
    gl.disable(gl.BLEND)
    gl.viewport(0, 0, dw, dh)
    // The velocity grid.
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, velocity)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, field.cols, field.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, field.bytes)
    // Advect and fade, current into the other.
    const from = targets[current]
    const to = targets[1 - current]
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.framebuffer)
    gl.useProgram(programs.advect)
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
    gl.enableVertexAttribArray(aLoc.aPosition)
    gl.vertexAttribPointer(aLoc.aPosition, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, from.texture)
    gl.uniform1i(aLoc.uDye, 0)
    gl.uniform1i(aLoc.uVel, 1)
    gl.uniform2f(aLoc.uLamp, lampWidth, lampHeight)
    gl.uniform3f(aLoc.uView, view.k, view.ox, view.oy)
    gl.uniform2f(aLoc.uCells, field.cols, field.rows)
    gl.uniform1f(aLoc.uCell, field.cell)
    gl.uniform1f(aLoc.uDt, dt)
    const keep = Math.pow(Math.max(0, 1 - Math.min(1, fade)), wall)
    gl.uniform1f(aLoc.uKeep, keep)
    gl.uniform1f(aLoc.uLogKeep, Math.max(-20, Math.log2(Math.max(keep, 1e-6))))
    gl.uniform1f(aLoc.uCurve, Math.max(0, Math.min(3, curve)))
    // The floor half floats need to reach nothing (8 bit: to get under a byte's rounding), and Tail cut over it.
    gl.uniform1f(aLoc.uFloor, (half ? 0.0002 : 0.6 / 255) + Math.max(0, cut) * wall)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    current = 1 - current
    // Stamp the particles, from the metaball pass's own vertices.
    if (drawn > 0 && stamp > 0) {
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.useProgram(programs.stamp)
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
      const bytes = stride * 4
      gl.enableVertexAttribArray(sLoc.aCentre)
      gl.vertexAttribPointer(sLoc.aCentre, 2, gl.FLOAT, false, bytes, 0)
      gl.enableVertexAttribArray(sLoc.aCorner)
      gl.vertexAttribPointer(sLoc.aCorner, 2, gl.FLOAT, false, bytes, 8)
      gl.enableVertexAttribArray(sLoc.aColor)
      gl.vertexAttribPointer(sLoc.aColor, 3, gl.FLOAT, false, bytes, 16)
      gl.bindBuffer(gl.ARRAY_BUFFER, prevBuffer)
      gl.enableVertexAttribArray(sLoc.aPrev)
      gl.vertexAttribPointer(sLoc.aPrev, 2, gl.FLOAT, false, 0, 0)
      gl.uniform2f(sLoc.uResolution, width, height)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, lava)
      gl.uniform1i(sLoc.uField, 0)
      // At least a dye texel and a half, or a stamp falls between texels and flickers.
      gl.uniform1f(sLoc.uSize, Math.max(1.5 / DYE_SCALE, DYE_STAMP_PX * scale * Math.sqrt(view.k)))
      gl.uniform1f(sLoc.uStamp, Math.min(1, stamp))
      gl.drawArrays(gl.TRIANGLES, 0, drawn * 6)
      gl.disableVertexAttribArray(sLoc.aPrev)
      gl.disableVertexAttribArray(sLoc.aColor)
      gl.disableVertexAttribArray(sLoc.aCorner)
      gl.disable(gl.BLEND)
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
  }

  // The dye to whatever framebuffer is bound, over what is there (Over) or in place of it, at Glow.
  function draw (mode, width, height, glow = 1) {
    if (!targets) return
    const { dLoc } = programs
    gl.viewport(0, 0, width, height)
    if (mode === 'over') { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA) } else gl.disable(gl.BLEND)
    gl.useProgram(programs.draw)
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
    gl.enableVertexAttribArray(dLoc.aPosition)
    gl.vertexAttribPointer(dLoc.aPosition, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, targets[current].texture)
    gl.uniform1i(dLoc.uDye, 0)
    const gain = mode === 'over' ? OVER_GAIN : mode === 'alone' ? 1 : UNDER_GAIN
    gl.uniform1f(dLoc.uGain, gain)
    gl.uniform1f(dLoc.uGlow, glow > 0 ? glow : 1)
    gl.uniform1f(dLoc.uKnee, Math.min(gain, GLOW_KNEE))
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.disable(gl.BLEND)
  }

  return { step, draw, dispose, get allocated () { return !!targets } }
}
