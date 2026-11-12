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
  let ids = null
  let xs = null
  let ys = null
  // The places dealt since the last take, for Layered, and whether a new deal began.
  let freshKeys = new Int32Array(1024)
  let freshValues = new Float32Array(1024)
  let freshN = 0
  let freshReset = false
  let tracking = false

  const grow = key => {
    const size = Math.max(key + 1, value.length * 2, 1024)
    const v = new Float32Array(size); v.set(value); value = v
    const s = new Int32Array(size); s.set(stamp); stamp = s
  }
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
    if (!look.staticColors || !state || !state.x) { lamp = null; tracking = false; freshN = 0; return null }
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
    }
    // The GPU lamp keeps no ids: a slot over the last frame's count is a particle born since (the count follows the window).
    if (!ids && count > lastCount) for (let i = lastCount; i < count && i < stamp.length; i++) stamp[i] = 0
    lastCount = count
    return valueAt
  }

  function valueAt (i) {
    const key = ids ? ids[i] : i
    if (key >= stamp.length) grow(key)
    if (stamp[key] !== deal) {
      value[key] = place(i, key)
      stamp[key] = deal
      if (tracking) {
        if (freshN === freshKeys.length) {
          const k = new Int32Array(freshN * 2); k.set(freshKeys); freshKeys = k
          const v = new Float32Array(freshN * 2); v.set(freshValues); freshValues = v
        }
        freshKeys[freshN] = key
        freshValues[freshN++] = value[key]
      }
    }
    return value[key]
  }

  // The places dealt since the last take, for the lamp (Layered), or null when there are none.
  function take () {
    if (!freshN && !freshReset) return null
    const out = { keys: freshKeys.subarray(0, freshN), values: freshValues.subarray(0, freshN), reset: freshReset }
    freshN = 0
    freshReset = false
    return out
  }

  return { begin, take }
}
