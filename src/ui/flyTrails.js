// A debug view, behind Advanced, Fly trails (Robert: "Can you temporarily make the flys always draw a path that trails and
// fades after 6 seconds so I can understand where they're moving and describe better how they should move").
// An overlay canvas over the lamp, its own frame loop, that draws every fly's path: the Firefly and Ice fly switches'
// flies (sim/firefly.js, handed in) and the music show's (moves/firefly.js keeps them on window.__fireflies and
// window.__iceflies, read only here). A line through each fly's last 6 s of points, fading to nothing, firefly orange
// and ice fly light blue; a dot at the point now, filled while its glints land on lava and hollow while they do not
// (dry: over water, or out of the lava, so it lights nothing). Dry stretches of the trail are drawn a little thinner (1.5 px to 2).
// Nothing here writes to the simulation, its heat or a fly. window.__flyTrailStats has, per kind, the seconds seen,
// the seconds dry and the longest dry stretch, and the seconds with no fly at all.
// Off by default; loaded by app.js the first time the switch goes on.
const KEEP = 6 // seconds a trail point lasts
const JUMP = 80 // px between two points that is a new fly or a turn of the lamp, not a path
const COLOUR = { fire: '255, 150, 40', ice: '150, 210, 255' }

export function startFlyTrails (frame, own, shown = () => true) {
  const el = document.createElement('canvas')
  Object.assign(el.style, { position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', zIndex: 5, pointerEvents: 'none' })
  document.body.append(el)
  const g = el.getContext('2d')
  const trails = new Map() // fly object to { kind, pts: [{ t, x, y, dry }], seen }
  const stats = { fire: { seen: 0, dry: 0, longestDry: 0, none: 0 }, ice: { seen: 0, dry: 0, longestDry: 0, none: 0 } }
  window.__flyTrailStats = stats
  let last = 0
  const flies = () => {
    const out = []
    for (const f of own.fire.flies) out.push(['fire', f])
    for (const f of own.ice.flies) out.push(['ice', f])
    for (const f of (window.__fireflies && window.__fireflies.list) || []) out.push(['fire', f])
    for (const f of (window.__iceflies && window.__iceflies.list) || []) out.push(['ice', f])
    return out
  }
  const draw = now => {
    requestAnimationFrame(draw)
    if (!shown()) { if (el.style.display !== 'none') { el.style.display = 'none'; trails.clear() } last = 0; return }
    el.style.display = ''
    const t = now / 1000, dt = last ? Math.min(0.1, t - last) : 0
    last = t
    const dpr = window.devicePixelRatio || 1, W = Math.round(window.innerWidth * dpr), H = Math.round(window.innerHeight * dpr)
    if (el.width !== W || el.height !== H) { el.width = W; el.height = H }
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, window.innerWidth, window.innerHeight)
    const fr = frame()
    const toPage = (x, y) => {
      if (fr.view) { x = x * fr.view.k + fr.view.ox; y = y * fr.view.k + fr.view.oy }
      const cx = x - fr.width / 2, cy = y - fr.height / 2
      const [px, py] = [[cx, cy], [-cy, cx], [-cx, -cy], [cy, -cx]][fr.turns & 3]
      return [px + fr.pageWidth / 2, py + fr.pageHeight / 2]
    }
    const live = new Set(), kinds = { fire: 0, ice: 0 }
    for (const [kind, f] of flies()) {
      if (!Number.isFinite(f.x) || !Number.isFinite(f.y)) continue
      live.add(f); kinds[kind]++
      let tr = trails.get(f)
      if (!tr) trails.set(f, tr = { kind, pts: [], dryFor: 0 })
      const dry = f.dry > 0
      const [x, y] = toPage(f.x, f.y)
      tr.pts.push({ t, x, y, dry })
      tr.dryFor = dry ? tr.dryFor + dt : 0
      tr.now = { x, y, dry }
      const s = stats[kind]
      s.seen += dt; if (dry) s.dry += dt
      s.longestDry = Math.max(s.longestDry, tr.dryFor)
    }
    for (const kind of ['fire', 'ice']) if (!kinds[kind] && (kind === 'fire' ? own.fireOn() : own.iceOn())) stats[kind].none += dt
    for (const [f, tr] of trails) {
      while (tr.pts.length && t - tr.pts[0].t > KEEP) tr.pts.shift()
      if (!tr.pts.length) { trails.delete(f); continue }
      const rgb = COLOUR[tr.kind]
      for (let i = 1; i < tr.pts.length; i++) {
        const a = tr.pts[i - 1], b = tr.pts[i]
        if (Math.hypot(b.x - a.x, b.y - a.y) > JUMP) continue
        g.strokeStyle = `rgba(${rgb}, ${(1 - (t - b.t) / KEEP).toFixed(3)})`
        g.lineWidth = b.dry ? 1.5 : 2
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke()
      }
      if (live.has(f) && tr.now) {
        g.beginPath(); g.arc(tr.now.x, tr.now.y, 3.5, 0, 2 * Math.PI)
        if (tr.now.dry) { g.strokeStyle = `rgb(${rgb})`; g.lineWidth = 1.5; g.stroke() } else { g.fillStyle = `rgb(${rgb})`; g.fill() }
      }
    }
  }
  requestAnimationFrame(draw)
}
