// How the firefly and the ice fly fly, one engine for the lamp's Firefly and Ice fly switches (sim/firefly.js) and the
// music's flies (the theme's firefly move, which imports this file), so the two never drift apart. No DOM.
// Robert, after watching their trails: "the flies spend a lot of time out of lava. I got it, they don't have to fly
// like a house fly, they can fly like a dragon fly or a house fly. I.e. when they're outside of the lava, they fly
// directly to the nearest targeted lava. While they're in lava or near it, they should fly in random patterns to try
// and soak as much opposite energy from the lava. The other thing I notice is that it seems to change its mind a lot
// when it's in a lava that's got plenty of energy to give. I think it should prefer to stay in bigger blobs with more
// opposite energy for longer before deciding to find another blob. It's also really satisfying when they're both
// right next to each other, we should have a mechanic for having that happen more frequently."
// Measured before (60 s, both switches on, a lamp 2560 px across): the firefly lit nothing 60% of the time, the ice
// fly 76% (17 dry stretches over a second, the longest 2.7 s); the ice fly's hottest blob jumped from blob to blob, so
// it swung across open water, and a curved blob's middle can sit in water, so looping round a middle lit nothing.
//
// The lava map (createLavaMap): every particle in the tank (over its top line, so no ceiling bottle, and down to its
// floor line, so no pot) into a grid of cells half a loop across, a cell lava when a particle is in it or most of its
// eight neighbours hold one (the gaps between particles closed). Each lava cell's depth is how far it is from the
// nearest water, and each water cell's reach how far it is from the nearest lava (two chamfer passes). The pool is
// the lava from each column's floor up to where it breaks off by SURFACE_GAP; the floating blobs are the lava cells
// over it (and 2 SURFACE_GAP clear of it), touching cells joined, LEAST particles or more. Each cell and blob keeps
// its opposite energies, a sum over its particles of how far under the heat where lava floats they are (cold, the
// firefly's: it heats cold lava) and how far over (hot, the ice fly's), in parts of that heat.
// A blob's score (Robert, on the ice fly: "it seemed like the ice fly especially would dive for a very hot but small
// glob in favor of a fairly warm large glob. The glob size should have a higher weight that scales with size"): its
// mean opposite energy a particle times its particles to the power Size weight (1.5), so a blob twice the size counts
// 2.8 times, where the plain sum (Size weight 1) counted it twice; then the pair's pull on top (below).
//
// Two ways to fly (stepFly):
// - Dragonfly, with none of its target's lava within a loop of its middle: straight and fast for the nearest of its
//   target's lava deep enough to hold a loop (the blob's nearest cells, not its middle), Dragonfly speed (2) times its
//   speed, eased down to its own speed over the last three loops so it does not overshoot, turning at up to TURN.
// - Housefly, over its target's lava or within a loop of it: short darts (DART_MIN to DART_MAX s) in random
//   directions at its own speed, each picked from DART_TRIES ways where the dart's end and middle stay on the blob deep
//   enough for the loop to stay on lava, weighed toward the cells with the most opposite energy a particle (the
//   firefly toward the blob's colder lava, the ice fly toward its hotter), and a new dart picked at once when the next
//   step would leave that, so it turns back at the edge and its glints land on lava. With no way that stays, for the
//   blob's nearest deep cell. Deep enough is DEEP loops and a cell (the map's own blur: a cell at the edge may be mostly water), or 0.8 of the blob's
//   deepest on a blob thinner than that, where its loop shrinks to the lava's depth under its middle (to LOOP_LEAST of
//   a loop at the least), so its glints still land on it. As a dragonfly its loop is whole.
// Sticky targets: a fly stays on its blob for at least Dwell s (4) from when it arrives and then until the blob's
// energy has fallen to Leave at (0.4) of the most it has had since (its mark on arrival, raised while the blob grows),
// (and then only for a blob that scores better than it does now), or another blob scores Switch margin (2) times its
// own, either held BEATEN_HOLD s so a merge or a split for a
// moment is no reason to go; a bigger and richer blob takes longer to drain, so keeps it longer. A blob is followed
// from one map to the next by the cells it shares with the last (the most of them, when it splits), or with none
// shared the blob now within LOST_LOOPS loops of where it was; a blob that sank into the pool leaves the fly on the
// pool's skin, its top two loops, which it leaves after its dwell for any floating blob with energy (the skin's size
// would beat every blob's score), and which is its target too with no floating blob of any energy (never a pot: the
// map ends at the floor line). Every target is inside
// the tank, and the fly's middle is kept a loop and EDGE px inside its top and floor lines (keepIn), so its point
// never enters a pot or a bottle.
// The pair (Robert: "It's also really satisfying when they're both right next to each other"): with a firefly and
// an ice fly both out, a blob near the other kind's fly scores up to 1 + 2 Pair pull times more (Pair pull 0.5, so
// twice, falling to nothing PAIR_REACH loops away), so a blob with both hot and cold lava, which serves both, draws
// them together; a pair the music's Both spawns together starts on one blob (pairBlob, the blob best for both).
export const FLIGHT = { dragon: 2, dwell: 4, leaveAt: 0.4, margin: 2, pairPull: 0.5, sizeWeight: 1.5 }
export const EDGE = 2 // px the point keeps inside the tank's top and floor lines, a glint's size
const SURFACE_GAP = 24 // px of no lava that ends the pool going up a column (the kit's)
const LEAST = 40 // particles a floating blob must hold to be sought
const SKIN_LOOPS = 2 // loops of the pool under its surface that are its skin, the target with no floating blob
const TURN = 10 // radians a second a dragonfly's heading turns at most
const EASE_LOOPS = 3 // loops from its aim over which a dragonfly slows to its own speed
const DART_MIN = 0.18, DART_MAX = 0.45 // seconds of a housefly's dart
const DART_TRIES = 10 // ways tried for a dart
const ENERGY_BIAS = 2 // how hard a dart leans toward the richer cells (a weight of 1 + this times the cell's share over the blob's mean)
const PAIR_REACH = 6 // loops from the other fly within which a blob is pulled up
const DEEP = 1 // loops (and a cell) of depth a housefly's middle keeps on its blob, or 0.8 of the blob's deepest
const LOOP_LEAST = 0.35 // of its loop, the smallest a housefly's loop shrinks to on a blob too thin for the whole loop
const BEATEN_HOLD = 1 // seconds another blob must keep scoring Switch margin times the fly's own, or its blob be drained, before it goes
const LOST_LOOPS = 2 // loops from where a target blob was that a blob is taken for it when it shares no cell with it
const FLOAT_FALLBACK = 1 // the heat a lamp with no temperatures is read against (its energies then a size alone)

// Distances on a grid (two chamfer passes, 3 and 4), in cells, from every cell to the nearest one where feature is 1.
const chamfer = (feature, cols, rows) => {
  const n = cols * rows, d = new Float32Array(n), BIG = 1e9
  for (let k = 0; k < n; k++) d[k] = feature[k] ? 0 : BIG
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = r * cols + c
    if (!d[k]) continue
    let v = d[k]
    if (c > 0) v = Math.min(v, d[k - 1] + 3)
    if (r > 0) { v = Math.min(v, d[k - cols] + 3); if (c > 0) v = Math.min(v, d[k - cols - 1] + 4); if (c < cols - 1) v = Math.min(v, d[k - cols + 1] + 4) }
    d[k] = v
  }
  for (let r = rows - 1; r >= 0; r--) for (let c = cols - 1; c >= 0; c--) {
    const k = r * cols + c
    if (!d[k]) continue
    let v = d[k]
    if (c < cols - 1) v = Math.min(v, d[k + 1] + 3)
    if (r < rows - 1) { v = Math.min(v, d[k + cols] + 3); if (c < cols - 1) v = Math.min(v, d[k + cols + 1] + 4); if (c > 0) v = Math.min(v, d[k + cols - 1] + 4) }
    d[k] = v
  }
  for (let k = 0; k < n; k++) d[k] = d[k] >= BIG ? Infinity : d[k] / 3
  return d
}

// The lava map: scan(world, cellPx) reads world { width, height (the floor line), x, y, temp, count, float (the heat
// where lava floats) } into the grid and the blobs; version counts the scans.
export function createLavaMap () {
  const map = {
    version: 0, cols: 0, rows: 0, cell: 1, width: 0, height: 0,
    lava: null, depth: null, reach: null, label: null, cnt: null, cold: null, hot: null,
    blobs: [], pool: null,
    scan (world, cellPx) {
      const { width: W, height: H, x: X, y: Y, count: n } = world
      const T = world.temp && world.temp.length >= n ? world.temp : null
      const g = world.float > 0 ? world.float : FLOAT_FALLBACK
      const cell = Math.max(2, cellPx), cols = Math.max(1, Math.ceil(W / cell)), rows = Math.max(1, Math.ceil(H / cell)), N = cols * rows
      const cnt = new Int32Array(N), cold = new Float32Array(N), hot = new Float32Array(N), sx = new Float32Array(N), sy = new Float32Array(N)
      for (let i = 0; i < n; i++) {
        const x = X[i], y = Y[i]
        if (!(y > 0) || !(y < H) || !(x >= 0) || !(x < W)) continue // the bottles over the top line, the pots under the floor
        const k = Math.floor(y / cell) * cols + Math.floor(x / cell)
        cnt[k]++; sx[k] += x; sy[k] += y
        if (T) { const e = (T[i] - g) / g; if (e > 0) hot[k] += e; else cold[k] -= e } else { cold[k] += 0.5; hot[k] += 0.5 }
      }
      // Lava: a cell with a particle, or one with five or more of its eight neighbours holding one.
      const lava = new Uint8Array(N)
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const k = r * cols + c
        if (cnt[k]) { lava[k] = 1; continue }
        let m = 0
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if ((dr || dc) && rr >= 0 && cc >= 0 && rr < rows && cc < cols && cnt[rr * cols + cc]) m++ }
        if (m >= 5) lava[k] = 1
      }
      const water = new Uint8Array(N)
      for (let k = 0; k < N; k++) water[k] = lava[k] ? 0 : 1
      const depth = chamfer(water, cols, rows), reach = chamfer(lava, cols, rows)
      for (let k = 0; k < N; k++) { depth[k] = Math.min(depth[k], 1e6) * cell; reach[k] = Math.min(reach[k], 1e6) * cell }
      // The pool: up each column from the floor while the lava breaks off by no more than SURFACE_GAP.
      const gapCells = Math.max(1, Math.ceil(SURFACE_GAP / cell)), clear = Math.ceil(2 * SURFACE_GAP / cell)
      const surface = new Int32Array(cols) // the pool's top row in each column (rows when it has none)
      for (let c = 0; c < cols; c++) {
        let top = rows, gap = 0
        for (let r = rows - 1; r >= 0; r--) { if (lava[r * cols + c]) { top = r; gap = 0 } else if (++gap > gapCells) break }
        surface[c] = top
      }
      // The floating blobs: lava cells over the pool by clear rows, touching cells joined.
      const label = new Int32Array(N).fill(-1), blobs = []
      for (let k0 = 0; k0 < N; k0++) {
        if (!lava[k0] || label[k0] !== -1 || Math.floor(k0 / cols) >= surface[k0 % cols] - clear) continue
        const cells = [], stack = [k0], id = blobs.length
        label[k0] = id
        let np = 0, x = 0, y = 0, ec = 0, eh = 0, deepest = 0
        while (stack.length) {
          const k = stack.pop(); cells.push(k)
          np += cnt[k]; x += sx[k]; y += sy[k]; ec += cold[k]; eh += hot[k]; if (depth[k] > deepest) deepest = depth[k]
          const r = Math.floor(k / cols), c = k % cols
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const rr = r + dr, cc = c + dc
            if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue
            const kk = rr * cols + cc
            if (lava[kk] && label[kk] === -1 && rr < surface[cc] - clear) { label[kk] = id; stack.push(kk) }
          }
        }
        blobs.push({ id, n: np, x: np ? x / np : 0, y: np ? y / np : 0, cold: ec, hot: eh, cells, deepest })
      }
      // Blobs too small are not sought: their cells keep no label.
      const kept = []
      for (const b of blobs) { if (b.n >= LEAST) { b.id = kept.length; for (const k of b.cells) label[k] = b.id; kept.push(b) } else for (const k of b.cells) label[k] = -1 }
      // The pool's skin, its top SKIN_LOOPS loops: the target with no floating blob of any energy.
      const skinRows = Math.max(1, Math.ceil(SKIN_LOOPS * 2))
      const skin = { id: -2, pool: true, n: 0, x: 0, y: 0, cold: 0, hot: 0, cells: [], deepest: 0 }
      for (let c = 0; c < cols; c++) for (let r = surface[c]; r < Math.min(rows, surface[c] + skinRows); r++) {
        const k = r * cols + c
        if (!lava[k]) continue
        skin.cells.push(k); skin.n += cnt[k]; skin.x += sx[k]; skin.y += sy[k]; skin.cold += cold[k]; skin.hot += hot[k]; if (depth[k] > skin.deepest) skin.deepest = depth[k]
      }
      if (skin.n) { skin.x /= skin.n; skin.y /= skin.n }
      for (const k of skin.cells) if (label[k] === -1) label[k] = -2
      Object.assign(map, { version: map.version + 1, cols, rows, cell, width: W, height: H, lava, depth, reach, label, cnt, cold, hot, blobs: kept, pool: skin.cells.length ? skin : null })
      return map
    },
    at (x, y) { const c = Math.floor(x / map.cell), r = Math.floor(y / map.cell); return c < 0 || r < 0 || c >= map.cols || r >= map.rows ? -1 : r * map.cols + c },
    blobOf (id) { return id === -2 ? map.pool : map.blobs[id] || null },
    centre (k) { return { x: (k % map.cols + 0.5) * map.cell, y: (Math.floor(k / map.cols) + 0.5) * map.cell } }
  }
  return map
}

const energyOf = (b, heats) => b ? (heats ? b.cold : b.hot) : 0
// A blob's score for a fly (o.heats: the firefly, which heats cold lava): its mean opposite energy times its size to the
// Size weight, pulled up near the other kind's flies.
export const scoreOf = (map, b, o, partners) => {
  if (!b || !b.n) return 0
  const e = energyOf(b, o.heats)
  if (!(e > 0)) return 0
  let s = (e / b.n) * Math.pow(b.n, o.sizeWeight ?? FLIGHT.sizeWeight)
  const pull = o.pairPull ?? FLIGHT.pairPull
  if (pull > 0 && partners && partners.length) {
    let near = 0
    const reach = PAIR_REACH * o.orbit
    for (const p of partners) { const d = nearestCell(map, b, p.cx, p.cy).d; near = Math.max(near, 1 - d / reach) }
    if (near > 0) s *= 1 + 2 * pull * near
  }
  return s
}
// The blob's nearest cell to (x, y) at least want px deep (any cell when none is): { k, d, x, y }.
const nearestCell = (map, b, x, y, want = 0) => {
  let best = -1, bd = Infinity, any = -1, ad = Infinity
  for (const k of b.cells) {
    const cx = (k % map.cols + 0.5) * map.cell, cy = (Math.floor(k / map.cols) + 0.5) * map.cell, d = Math.hypot(cx - x, cy - y)
    if (d < ad) { ad = d; any = k }
    if (map.depth[k] >= want && d < bd) { bd = d; best = k }
  }
  const k = best >= 0 ? best : any
  if (k < 0) return { k: -1, d: Infinity, x, y }
  const c = map.centre(k)
  return { k, d: best >= 0 ? bd : ad, x: c.x, y: c.y, nearest: ad }
}
const candidates = (map, o) => {
  const list = map.blobs.filter(b => energyOf(b, o.heats) > 0)
  return list.length ? list : map.pool ? [map.pool] : []
}
// The blob best for both kinds at once, for a pair born together: each kind's score over its best, summed, and twice the
// lesser of the two on top, so a blob with lava for both (hot and cold) wins over one rich for one kind alone.
export const pairBlob = (map, oFire, oIce) => {
  const list = map.blobs.length ? map.blobs : map.pool ? [map.pool] : []
  let topF = 0, topI = 0
  for (const b of list) { topF = Math.max(topF, scoreOf(map, b, oFire)); topI = Math.max(topI, scoreOf(map, b, oIce)) }
  let best = null, bs = -1
  for (const b of list) { const f = topF ? scoreOf(map, b, oFire) / topF : 0, i = topI ? scoreOf(map, b, oIce) / topI : 0, s = f + i + 2 * Math.min(f, i); if (s > bs) { bs = s; best = b } }
  return best
}
// Sets a fly on a blob: its cells kept to follow it into the next map.
export const settleOn = (f, map, b, arrived = false, why = 'first') => {
  if (f.target && b !== f.target) { f.switches = (f.switches || 0) + 1; (f.why || (f.why = {}))[why] = (f.why[why] || 0) + 1 } // for measuring: how often and why it changed its mind
  f.target = b; f.cells = b ? b.cells.slice() : null; f.ver = map.version
  f.chosenAt = f.clock || 0
  f.arrivedAt = arrived ? f.clock || 0 : null; f.arriveE = null
}
// The target blob carried into a newer map: the blob holding most of its last cells, or null when none does.
const follow = (f, map, orbit) => {
  if (!f.target || !f.cells) return null
  const votes = new Map()
  for (const k of f.cells) { const id = k < map.label.length ? map.label[k] : -1; if (id !== -1) votes.set(id, (votes.get(id) || 0) + 1) }
  let best = null, bv = 0
  for (const [id, v] of votes) if (v > bv) { bv = v; best = id }
  if (best === null) {
    // None shared: the blob now nearest where it was, if any is within LOST_LOOPS loops.
    let near = null, nd = LOST_LOOPS * orbit
    for (const b of map.blobs) { const d = nearestCell(map, b, f.target.x, f.target.y).d; if (d < nd) { nd = d; near = b } }
    return near
  }
  if (f.target.pool && best !== -2 && map.pool) return map.pool // the skin stays the skin
  return map.blobOf(best)
}
// The choice, once a map: keep the blob while its dwell runs, then leave it once drained to Leave at or beaten by
// Switch margin.
const choose = (f, map, o, partners) => {
  const list = candidates(map, o)
  const cur = f.target ? follow(f, map, o.orbit) : null
  let best = null, bs = 0
  for (const b of list) { const s = scoreOf(map, b, o, partners); if (s > bs) { bs = s; best = b } }
  if (!cur) { settleOn(f, map, best, false, 'lost'); return }
  // Carried over: the same blob in the new map.
  f.target = cur; f.cells = cur.cells.slice(); f.ver = map.version
  const e = energyOf(cur, o.heats), sc = scoreOf(map, cur, o, partners)
  // Its energy's mark: what it had on arrival, raised while it grows (a glob still leaving the pool), so drained is
  // drained from the most it has had since the fly came.
  if (f.arrivedAt !== null) f.arriveE = Math.max(f.arriveE ?? 0, e)
  const since = f.arrivedAt !== null ? f.clock - f.arrivedAt : f.clock - f.chosenAt
  if (since < (o.dwell ?? FLIGHT.dwell)) { f.beatenAt = null; return }
  // The pool's skin (where its blob sank, or with nothing floating) is left after its dwell for a floating blob with
  // any energy: the skin's size would beat every blob's score.
  if (cur.pool && best && !best.pool) { settleOn(f, map, best, false, 'pool'); return }
  // Drained, held as long: a blob that splits for a moment drops its energy for a moment.
  const low = !(e > 0) || (f.arriveE !== null && e < (o.leaveAt ?? FLIGHT.leaveAt) * f.arriveE) // none left is drained too
  if (!low) f.lowAt = null; else if (f.lowAt == null) f.lowAt = f.clock
  const drained = low && f.clock - f.lowAt >= BEATEN_HOLD
  // Beaten only when it has been beaten for BEATEN_HOLD s, so a merge or a split for a moment is not a reason to go.
  const beaten = best && best !== cur && bs > (o.margin ?? FLIGHT.margin) * sc
  if (!beaten) f.beatenAt = null; else if (f.beatenAt == null) f.beatenAt = f.clock
  if (beaten && f.clock - f.beatenAt >= BEATEN_HOLD) { f.beatenAt = null; settleOn(f, map, best, false, 'beaten'); return }
  if (drained) {
    let next = null, ns = 0
    for (const b of list) { if (b === cur) continue; const s = scoreOf(map, b, o, partners); if (s > ns) { ns = s; next = b } }
    // Only for a blob that scores better than this one now: drained or not, it may still be the best there is.
    if (next && ns > sc) settleOn(f, map, next, false, 'drained')
    else { f.arrivedAt = f.clock; f.arriveE = e; f.lowAt = null } // nothing better to go to: a fresh dwell here
  }
}

// Keeps a fly's middle inside the tank, out of every pot and bottle (see EDGE): gives true when it had to be moved.
export const keepIn = (f, W, H, orbit) => {
  const top = orbit + EDGE, bottom = H - orbit - EDGE
  let out = false
  if (f.cx < orbit) { f.cx = orbit; f.heading = Math.PI - f.heading; out = true } else if (f.cx > W - orbit) { f.cx = W - orbit; f.heading = Math.PI - f.heading; out = true }
  if (f.cy < top) { f.cy = top; if (Math.sin(f.heading) < 0) f.heading = -f.heading; out = true } else if (f.cy > bottom) { f.cy = Math.max(top, bottom); if (Math.sin(f.heading) > 0) f.heading = -f.heading; out = true }
  return out
}

// A new fly's flight state on f (it keeps its own middle, heading and loop).
export const startFlight = f => Object.assign(f, { clock: 0, mode: 'dragon', target: null, cells: null, ver: -1, chosenAt: 0, arrivedAt: null, arriveE: null, switches: 0, dart: 0, v: 0 })

// One step of a fly's middle over dt s. o: { speed (px/s), orbit (px), heats (the firefly; the ice fly cools), dragon, dwell, leaveAt, margin, pairPull,
// sizeWeight, boost }; partners: the other kind's flies ({ cx, cy }); W, H the tank. Then its loop: f.x, f.y the point.
export const stepFly = (f, map, o, partners, dt, W, H) => {
  if (f.clock === undefined) startFlight(f)
  f.clock += dt
  const orbit = o.orbit, boost = o.boost || 1, speed = o.speed * boost
  if (map && map.version && f.ver !== map.version) choose(f, map, o, partners)
  const b = f.target
  if (map && b && b.cells.length) {
    const want = Math.min(DEEP * orbit + map.cell, 0.8 * b.deepest)
    const aim = nearestCell(map, b, f.cx, f.cy, want)
    const near = aim.nearest ?? aim.d
    // Housefly within a loop of its lava, dragonfly past a loop and a half (between, as it was).
    if (near <= orbit) f.mode = 'house'; else if (near > 1.5 * orbit) f.mode = 'dragon'
    if (f.mode === 'house' && f.arrivedAt === null) { f.arrivedAt = f.clock; f.arriveE = energyOf(b, o.heats) }
    if (f.mode === 'dragon') {
      let d = Math.atan2(aim.y - f.cy, aim.x - f.cx) - f.heading
      d = Math.atan2(Math.sin(d), Math.cos(d))
      f.heading += Math.max(-TURN * dt, Math.min(TURN * dt, d))
      const fast = speed * (o.dragon ?? FLIGHT.dragon), ease = Math.min(1, aim.d / (EASE_LOOPS * orbit))
      const want = speed + (fast - speed) * ease
      f.v += (want - f.v) * Math.min(1, 6 * dt)
      f.dart = 0
    } else {
      // A housefly's dart: a new one when the last is done or its next step would leave the blob's deep lava.
      const ok = (x, y) => { const k = map.at(x, y); return k >= 0 && map.label[k] === b.id && map.depth[k] >= want }
      const nx = f.cx + speed * Math.cos(f.heading) * dt, ny = f.cy + speed * Math.sin(f.heading) * dt
      f.dart -= dt
      if (f.dart <= 0 || !ok(nx, ny)) {
        const t = DART_MIN + Math.random() * (DART_MAX - DART_MIN), len = speed * t
        const mean = energyOf(b, o.heats) / Math.max(1, b.n)
        let bestH = null, bw = -1
        for (let i = 0; i < DART_TRIES; i++) {
          const h = Math.random() * 2 * Math.PI, ex = f.cx + len * Math.cos(h), ey = f.cy + len * Math.sin(h)
          if (!ok(ex, ey) || !ok((f.cx + ex) / 2, (f.cy + ey) / 2)) continue
          const k = map.at(ex, ey), e = map.cnt[k] ? (o.heats ? map.cold[k] : map.hot[k]) / map.cnt[k] : 0
          const w = Math.random() * (1 + ENERGY_BIAS * (mean > 0 ? Math.min(3, e / mean) : 0))
          if (w > bw) { bw = w; bestH = h }
        }
        // No way stays on it (a thin blob, or off its deep lava): for its nearest deep cell.
        f.heading = bestH !== null ? bestH : Math.atan2(aim.y - f.cy, aim.x - f.cx)
        f.dart = bestH !== null ? t : 0.1
      }
      f.v += (speed - f.v) * Math.min(1, 10 * dt)
    }
  } else {
    // No lava to go to at all: drift, turning a little at random.
    f.mode = 'dragon'
    f.heading += (Math.random() - 0.5) * 4 * dt
    f.v += (speed - f.v) * Math.min(1, 6 * dt)
  }
  f.cx += f.v * Math.cos(f.heading) * dt; f.cy += f.v * Math.sin(f.heading) * dt
  keepIn(f, W, H, orbit)
  // Its loop: whole as a dragonfly, and as a housefly no wider than the lava is deep under its middle (down to
  // LOOP_LEAST of it), so on a thin blob its glints still land on the lava.
  let r = orbit
  if (map && f.mode === 'house') { const k = map.at(f.cx, f.cy); r = Math.max(LOOP_LEAST * orbit, Math.min(orbit, k >= 0 ? map.depth[k] - map.cell : 0)) }
  f.r = f.r === undefined ? orbit : f.r + (r - f.r) * Math.min(1, 8 * dt)
  f.a += f.dir * o.loops * 2 * Math.PI * boost * dt
  f.x = f.cx + f.r * Math.cos(f.a); f.y = f.cy + f.r * Math.sin(f.a)
}
