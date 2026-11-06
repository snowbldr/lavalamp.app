// The Firefly switch: an unseen wanderer that lives in the lava all the time (Robert: "we should make a firefly lavalamp
// toggle that just runs the firefly all the time in the regular lamp"; "like, just a firefly that lives in the lava all
// the time"). No force and no flow: its point circles a middle that drifts across the lamp, so its path is a travelling
// spiral of loops, and wherever the point is over lava it drops a glint, a tiny hot touch held a moment. Over the water
// it drops nothing.
// How it flies is sim/flyFlight.js, shared with the music's flies (Robert: "when they're outside of the lava, they fly
// directly to the nearest targeted lava. While they're in lava or near it, they should fly in random patterns to try
// and soak as much opposite energy from the lava"): a dragonfly, straight and fast for its target blob's nearest
// lava, while none of it is within a loop; a housefly, darting at random over the blob's lava and turning back at its
// edge, while it is. The firefly's target is the blob with the most cold to heat (its mean coldness under the heat
// where lava floats times its size to the Size weight), the ice fly's the most heat to cool; each stays on its blob
// for Dwell s and then until it is drained to Leave at or another scores Switch margin times better; and each
// scores a blob near the other kind's fly higher by Pair pull, so the two meet. Before (its loops round the lowest
// blob's middle, the ice fly's round the hottest's, riding the lava it was on): the firefly lit nothing 60% of the
// time and the ice fly 76%, at a lamp 2560 px across.
// It is born on a particle, so it begins in lava, and then lives for as
// long as the switch is on, one firefly on one unbroken path (Robert: "it's supposed to just have one that lives
// forever with an unbroken path"; the first cut flew up to six, each living 12 s and reborn, which he read as many).
// The tuning keeps most and life for a tool that wants a swarm; the lamp's switch sets most 1 and life Infinity.
// The values are Robert's ("these settings are what I'm using"), at a lamp 661 px across: px scale with the lamp's
// width over that; since the deploy a little cooler and a pixel smaller (Robert: "by aggressive, I mean slightly too
// much heat and maybe 1 px too big"): 2 px at 1500, were 3 and 1920. No DOM: firefly.tick reads the particles' positions and hands back the frame's touches.
// The Ice fly switch (Robert: "add an ice fly that is a cold fire fly in all places") is the same wanderer made with
// ICE_TUNING: its glints are the lamp's 'cool' touch, the cold sparkle as a tool's balanced sparkles draw it (one point,
// 2 px), taking out what the firefly puts in (1500 each, so one of each is heat neutral), and it seeks the hot lava to
// cool it, as sim/flyFlight.js has it.
// Never in a pot or a bottle, either fly (Robert: "the flyer fly are not allowed to fly in pots or bottles"): every
// bottle is above the tank's top line (y 0, the mouths in it) and every pot under the floor line (under the screen's
// bottom, the hidden floor below it), so the middle is kept a loop and EDGE px inside the screen's top and bottom and
// the point, the middle plus a loop, never crosses either line; a middle found outside (born there, or the lamp resized
// under it) is put back at once, straight across the line, where the mouth it would leave by sits. A target is a
// floating blob or the pool's surface, never inside one. Before, the middle was kept 0.6 of a loop off the bottom, so
// the point dipped 0.4 of a loop (5 px) under the screen's bottom, into the hidden floor (not yet a pot there).
import { FLIGHT, EDGE, createLavaMap, startFlight, stepFly } from './flyFlight.js'
const TUNED_WIDTH = 661
// Dragonfly speed, Dwell s, Leave at, Switch margin, Pair pull and Size weight: sim/flyFlight.js's FLIGHT, as the
// music's flies have them.
const TUNING = { speed: 140, orbit: 13, loops: 1.5, rate: 38, life: Infinity, most: 1, size: 2, heat: 1500, seconds: 0.032, ...FLIGHT }
export const ICE_TUNING = { ...TUNING, cold: true } // the Ice fly switch's: heat is the cold each glint takes out
const SEEK_EVERY = 6 // frames between maps of the lava
const MAX_GLINTS = 8 // touches a frame at most (the GPU lamp's MAX_TOUCHES)
const PAUSE_MIN = 0.5, PAUSE_MAX = 2 // seconds between one dying and the next being born
// Every swarm made here, so each kind finds the other's flies for the pair's pull.
const swarms = new Set()

// createFireflies() gives { tick(lamp, dt, room), clear() }, createFireflies(ICE_TUNING) the ice fly. lamp: { width,
// height, x, y, temp, count, float }, the lamp's size in px, the particles' positions and temperatures (any arrays, read
// only, count of them; temp may be missing) and the heat where lava floats. tick returns the frame's touches, { x, y,
// mode: 'heat' (the ice fly's 'cool'), radius, heat }, at most room (MAX_GLINTS when not given).
export function createFireflies (s = TUNING) {
  s = { ...FLIGHT, ...s }
  let flies = []
  let glints = [] // { x, y, radius, heat, left }: held for their seconds, sent while held
  let wait = 0 // seconds before the next may be born
  const map = createLavaMap()
  const me = { cold: !!s.cold, get flies () { return flies } }
  swarms.add(me)
  const partners = () => { const out = []; for (const w of swarms) if (w.cold !== me.cold) out.push(...w.flies); return out }
  const overLava = (lamp, x, y, px) => {
    const { x: X, y: Y, count: n } = lamp
    const p2 = px * px
    for (let i = 0; i < n; i++) { const dx = X[i] - x, dy = Y[i] - y; if (dx * dx + dy * dy < p2) return true }
    return false
  }
  const born = (lamp, k) => {
    const W = lamp.width, H = lamp.height, orbit = s.orbit * k, n = lamp.count
    const top = orbit + EDGE, bottom = H - orbit - EDGE // born on a particle inside the tank, never in a pot or a bottle
    let cx = orbit + Math.random() * (W - 2 * orbit), cy = Math.min(bottom, H * (0.5 + 0.5 * Math.random()) - orbit)
    for (let t = 0; t < 60 && n; t++) { const i = Math.floor(Math.random() * n); const x = lamp.x[i], y = lamp.y[i]; if (x > orbit && x < W - orbit && y > top && y < bottom) { cx = x; cy = y; break } }
    flies.push(startFlight({ cx, cy, heading: Math.random() * 2 * Math.PI, a: Math.random() * 2 * Math.PI,
      dir: Math.random() < 0.5 ? -1 : 1, life: s.life * (0.67 + 0.66 * Math.random()), age: 0, due: 0, dry: 0 }))
  }
  let frame = 0
  return {
    tick (lamp, dt, room = MAX_GLINTS) {
      const W = lamp.width, H = lamp.height, k = W / TUNED_WIDTH
      const orbit = s.orbit * k, size = Math.max(1, s.size * k)
      wait -= dt
      if (flies.length < s.most && wait <= 0) { born(lamp, k); wait = PAUSE_MIN + Math.random() * (PAUSE_MAX - PAUSE_MIN) }
      if (flies.length && (frame++ % SEEK_EVERY === 0)) map.scan(lamp, orbit / 2)
      const o = { ...s, speed: s.speed * k, orbit, heats: !s.cold }
      const others = partners()
      for (const f of flies) {
        f.age += dt
        stepFly(f, map, o, others, dt, W, H)
        const x = f.x, y = f.y
        const fade = Number.isFinite(f.life) ? Math.max(0, Math.min(1, 3 * (1 - f.age / f.life))) : 1 // a firefly that lives forever never fades
        f.due += s.rate / flies.length * fade * dt // Glints a s shared by all that fly, so more flies do not heat more
        while (f.due >= 1) {
          f.due -= 1
          const over = x > 2 && x < W - 2 && y > EDGE && y < H - EDGE && overLava(lamp, x, y, size)
          if (over) { f.dry = 0; glints.push({ x, y, radius: size, heat: s.heat * fade, left: s.seconds }) } else f.dry += 1
        }
      }
      flies = flies.filter(f => f.age < f.life)
      // A glint waits for a slot rather than being lost (a tool's sparkle queue does the same): the oldest are sent and
      // only a sent glint's time runs.
      const out = []
      const n = Math.min(Math.max(0, room), glints.length)
      for (let i = 0; i < n; i++) { const g = glints[i]; out.push({ x: g.x, y: g.y, mode: s.cold ? 'cool' : 'heat', radius: g.radius, heat: g.heat }); g.left -= dt }
      glints = glints.filter(g => g.left > 0)
      if (glints.length > 64) glints.splice(0, glints.length - 64)
      return out
    },
    clear () { flies = []; glints = []; wait = 0 },
    get flying () { return flies.length },
    get waiting () { return glints.length }, // glints held or waiting for a slot, for the room app.js keeps for them
    get flies () { return flies }, // for measuring: each fly's middle (cx, cy), point (x, y), dry, mode and target
    get target () { return flies.length ? flies[0].target : null },
    get map () { return map } // for measuring: the lava map the flies fly by
  }
}
