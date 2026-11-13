// Static colors (settings.js staticColors; Robert: "one thing that might be interesting is having the color not be
// based on [heat], but instead a fixed gradient and a fixed color for every particle. I bet some really interesting color
// patterns emerge from nowhere", then "could be a view setting, 'static colors'"). A view only: the simulation is not
// touched, heat still lifts and sinks the lava as before, and only the colour each disc is drawn in changes.
//
// Every particle is dealt one place on the theme's heat gradient, 0 its cold end to 1 its hot end, and keeps it for
// life. By height (the default) the lava on screen is ranked from bottom to top when the colours are dealt, so the
// lamp starts as even bands, each holding as much lava as the next, cold at the bottom and hot at the top, as a lava
// lamp and the density order have it (Robert, 2026-11-11: "cold should be on the bottom, not on top"; it was cold at
// the top as first shipped); Across ranks it left to right; Random gives each particle its own place. The ranking is kept, so
// a particle born later (a bigger window), or first drawn later (a pot's or a bottle's hidden lava coming on screen),
// is placed by where it is then among the lava as it was dealt.
// The colours are dealt when the switch goes on, on a reload with it on (the lava as spawned), when the pick changes
// and when the lava starts over; a lamp turned on after a long run deals from where its lava is then.
//
// The places live here, by the particle's own id where the lamp reorders its particles (the CPU lamp's sort, the
// worker's), by index on the GPU lamp, whose order holds. Nothing runs while the switch is off; while it is on, the
// renderer's own loop over the particles asks for each place (valueAt), one array read once dealt.
//
// Density (settings.js staticColorsLayered, shown as Density; it was Layered) weighs each particle by its place: the places dealt since the last frame
// are handed to the lamp (take, then the lamp's setPlaces), keyed as they are here, and the lamp's buoyancy reads them
// (simulation.js layerGravity). A new deal is sent with reset, so the lamp forgets the old places first.
//
// The flies (Robert: "the flys disappear in static color mode, we hsoul dhave the flys change the density instead of
// heat when static color is enabled. that should be fun"): with the switch on, the Firefly and Ice fly switches'
// glints come here (fly) instead of going to the lamp as heat (app.js). A glint moves the places it touches the way it
// would have moved their heat, its heat over twice neutral a step (the heat colours' own scale: twice neutral is the
// gradient's top), the firefly's toward the hot end and the ice fly's toward the cold, so touched lava is drawn in the
// new colour and, with Density, weighs as it: the firefly's rises, the ice fly's sinks. Each moved place eases back to
// the one it was dealt (its home, kept apart) over Fly fade s (settings.js staticFlyFade), as a glint's heat fades,
// so the lamp never drifts to one colour. Moved places go to the lamp with the dealt ones (take).
export const staticColorsBys = ['height', 'across', 'random']
export const staticColorsByNames = { height: 'Height', across: 'Across', random: 'Random' }

export function createStaticColors () {
  let value = new Float32Array(0)
  let stamp = new Int32Array(0) // the deal a place belongs to
  let deal = 0
  let lamp = null
  let by = ''
  let table = new Float32Array(0) // the dealt lava's sorted heights (or x), for ranking
  let tableN = 0
  let lastCount = 0
  let drawn = 0 // frames begun with the switch on, so placesNow is built once a frame
  let ids = null
  let xs = null
  let ys = null
  // The places dealt since the last take, for Layered, and whether a new deal began.
  let freshKeys = new Int32Array(1024)
  let freshValues = new Float32Array(1024)
  let freshN = 0
  let freshReset = false
  let tracking = false
  // The flies: each place now where a glint moved it (off its home), whether it is off, and the keys that are.
  let now = new Float32Array(0)
  let off = new Uint8Array(0)
  let moved = new Int32Array(256)
  let movedN = 0
  const pending = [] // the frames' glints since the last begin: { touches, per, seconds, fade }

  const grow = key => {
    const size = Math.max(key + 1, value.length * 2, 1024)
    const v = new Float32Array(size); v.set(value); value = v
    const s = new Int32Array(size); s.set(stamp); stamp = s
    const n = new Float32Array(size); n.set(now); now = n
    const o = new Uint8Array(size); o.set(off); off = o
  }
  const send = (key, v) => {
    if (!tracking) return
    if (freshN === freshKeys.length) {
      const k = new Int32Array(freshN * 2); k.set(freshKeys); freshKeys = k
      const w = new Float32Array(freshN * 2); w.set(freshValues); freshValues = w
    }
    freshKeys[freshN] = key
    freshValues[freshN++] = v
  }
  const unmove = () => { for (let j = 0; j < movedN; j++) off[moved[j]] = 0; movedN = 0 }
  // The share of the dealt lava above (or left of) c; y runs down the screen.
  const rank = c => {
    if (!tableN) return 0.5
    let lo = 0
    let hi = tableN
    while (lo < hi) { const mid = (lo + hi) >> 1; if (table[mid] < c) lo = mid + 1; else hi = mid }
    return lo / tableN
  }
  // A fixed scatter in [0, 1) from the key (an integer hash), so Random is the same particle to particle across frames.
  const scatter = key => {
    let h = (key + 1) * 0x9e3779b1
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }
  // Height deals the cold end (0) at the bottom: the share of the lava below a particle, so 1 minus the share above.
  const place = (i, key) => by === 'random' ? scatter(key) : by === 'across' ? rank(xs[i]) : 1 - rank(ys[i])

  // Once a frame before the renderer's loop: null while the switch is off, else valueAt for this frame's particles.
  // width and height are the lamp's on-screen size in lamp px: only the lava inside it is ranked.
  function begin (look, state, count, owner, width, height) {
    if (!look.staticColors || !state || !state.x) { lamp = null; tracking = false; freshN = 0; pending.length = 0; unmove(); return null }
    tracking = !!(owner && owner.setPlaces)
    ids = owner && owner.gpu ? null : state.id || null // the GPU lamp's ids are its indices (owner.gpu)
    xs = state.x
    ys = state.y
    const want = staticColorsBys.includes(look.staticColorsBy) ? look.staticColorsBy : 'height'
    // Not dealt from no lava: the worker lamp's first frames come before its first state.
    if (!count) return valueAt
    if (owner !== lamp || want !== by) {
      lamp = owner
      by = want
      deal++
      if (table.length < count + 1) table = new Float32Array(count + 1)
      const c = by === 'across' ? xs : ys
      const top = by === 'across' ? width : height
      tableN = 0
      for (let i = 0; i < count; i++) {
        if (ys[i] < 0 || ys[i] > height || xs[i] < 0 || xs[i] > width) continue
        table[tableN++] = c[i]
      }
      if (!tableN) { table[0] = top / 2; tableN = 1 }
      table.subarray(0, tableN).sort()
      lastCount = count
      freshN = 0
      freshReset = true
      unmove()
    }
    // The GPU lamp keeps no ids: a slot over the last frame's count is a particle born since (the count follows the window).
    if (!ids && count > lastCount) for (let i = lastCount; i < count && i < stamp.length; i++) stamp[i] = 0
    lastCount = count
    if (pending.length) flown(count)
    drawn++
    return valueAt
  }

  // The flies' glints since the last frame, from app.js while the switch is on: touches as the lamp takes them ({ x, y,
  // mode 'heat' or 'cool', radius, heat }), per the place a unit of heat moves (the frame's steps over twice neutral),
  // seconds the frame's time and fade Fly fade s. Called every frame the switch is on, with no touches too, so the
  // moved places keep easing home.
  function fly (touches, per, seconds, fade) { if (pending.length < 240) pending.push({ touches, per, seconds, fade }) } // at most 4 s of frames waiting for a draw

  // Ease the moved places home, then move the touched ones (the lamp's touchAt: exp(-q^2), none past 2.5 radii).
  function flown (count) {
    for (const { touches, per, seconds, fade } of pending) {
      // Fly fade s brings a place 95% of the way home (three time constants); 0 sends it home at once.
      const ease = fade > 0 ? 1 - Math.exp(-3 * seconds / fade) : 1
      let kept = 0
      for (let j = 0; j < movedN; j++) {
        const key = moved[j]
        if (!off[key]) continue
        if (stamp[key] !== deal) { off[key] = 0; continue }
        const home = value[key]
        let v = now[key] + (home - now[key]) * ease
        if (Math.abs(v - home) < 0.002) { v = home; off[key] = 0 } else moved[kept++] = key
        now[key] = v
        send(key, v)
      }
      movedN = kept
      if (!touches.length || !(per > 0)) continue
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const t of touches) {
        const r = 2.5 * t.radius
        x0 = Math.min(x0, t.x - r); x1 = Math.max(x1, t.x + r); y0 = Math.min(y0, t.y - r); y1 = Math.max(y1, t.y + r)
      }
      for (let i = 0; i < count; i++) {
        const x = xs[i], y = ys[i]
        if (x < x0 || x > x1 || y < y0 || y > y1) continue
        let du = 0
        for (const t of touches) {
          const q = Math.hypot(x - t.x, y - t.y) / t.radius
          if (q > 2.5) continue
          du += (t.mode === 'cool' ? -t.heat : t.heat) * Math.exp(-q * q)
        }
        if (!du) continue
        const was = valueAt(i)
        const v = Math.max(0, Math.min(1, was + du * per))
        if (v === was) continue
        const key = ids ? ids[i] : i
        now[key] = v
        if (!off[key]) {
          off[key] = 1
          if (movedN === moved.length) { const m = new Int32Array(movedN * 2); m.set(moved); moved = m }
          moved[movedN++] = key
        }
        send(key, v)
      }
    }
    pending.length = 0
  }

  function valueAt (i) {
    const key = ids ? ids[i] : i
    if (key >= stamp.length) grow(key)
    if (stamp[key] !== deal) {
      value[key] = place(i, key)
      stamp[key] = deal
      off[key] = 0
      send(key, value[key])
    }
    return off[key] ? now[key] : value[key]
  }

  // Each of state's particles' place now (where a glint moved it, else its dealt one), by its index in state, times
  // scale, for the flies to pick their lava by (app.js), or null while the switch is off. Keyed by state's own ids, as
  // the last frame's (the GPU lamp's ids are its indices). Read only: a particle not yet dealt reads the middle. Built
  // at most once a frame for one state and scale.
  let nowList = new Float32Array(0)
  let nowAt = -1
  let nowScale = 0
  let nowState = null
  function placesNow (state, count, scale = 1) {
    if (!lamp || !state) return null
    const keys = ids ? state.id || ids : null
    if (keys) count = Math.min(count, keys.length)
    if (nowAt === drawn && nowScale === scale && nowState === state && nowList.length >= count) return nowList
    if (nowList.length < count) nowList = new Float32Array(Math.max(count, nowList.length * 2, 1024))
    for (let i = 0; i < count; i++) {
      const key = keys ? keys[i] : i
      nowList[i] = scale * (key < stamp.length && stamp[key] === deal ? (off[key] ? now[key] : value[key]) : 0.5)
    }
    nowAt = drawn
    nowScale = scale
    nowState = state
    return nowList
  }

  // The places dealt since the last take, for the lamp (Layered), or null when there are none.
  function take () {
    if (!freshN && !freshReset) return null
    const out = { keys: freshKeys.subarray(0, freshN), values: freshValues.subarray(0, freshN), reset: freshReset }
    freshN = 0
    freshReset = false
    return out
  }

  return { begin, take, fly, placesNow }
}
