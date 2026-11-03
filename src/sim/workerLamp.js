// The page's side of the CPU lamp on a worker thread (see cpuWorker.js): the same shape as the
// simulation and the GPU lamp, so app.js wires it the same way. The worker posts a state after
// every step; the page keeps the last two and `interpolate` draws between them by wall time,
// one step behind the worker, so the drawing runs at the display's rate whatever the step
// costs. Inputs (fingers, shoves, settings, pace, what the overlays want) go across once a
// frame; the flow field, heater and bottles come back sampled, since the world lives in the
// worker now and the overlays only ever read them at fixed spacings.
export function createWorkerLamp ({ width, height, params, seed, frame, pace, want }) {
  const worker = new Worker(new URL('./cpuWorker.js', import.meta.url), { type: 'module' })
  let latest = null // the newest state from the worker: { count, x, y, vx, vy, temp, at, generation }
  let previous = null // the one before it
  let gap = frame / Math.max(pace, 0.01) * 1000 // smoothed wall ms between states
  let stepMs = 0 // smoothed step cost in the worker
  let steps = 0 // states received, for the profile
  let generation = 0
  const turns = [] // affine maps applied since each generation, for states that left the worker before a turn
  let elements = []
  let flow = null
  let heater = null
  let cups = null
  let bottles = []
  let floorBottles = []
  let touches = []
  let slotOf = new Int32Array(0) // previous slot by birth index
  let slotGen = new Int32Array(0) // which build of slotOf each entry belongs to
  let slotBuild = 0
  let push = null
  let light = 0 // pots to light at the next frame (the music's beat)
  let eddy = 0 // eddies to bear at the next frame (the music's beat)
  let pulse = 0 // pulse waves to send
  const flip = [] // eddy flips to send, each a chance
  let vent = {} // per reserve, seconds to lift its lid for
  let charge = { drop: 0, boom: 0, beat: 0 } // the reserves' heats, held
  let release = {} // per reserve, a blast's strength
  let retire = [] // reserves to hand back
  let sentParams = ''
  const empty = new Float32Array(0)
  const state = { x: empty, y: empty, vx: empty, vy: empty, temp: empty, id: new Int32Array(0) }

  const affine = fn => {
    const [c, f] = fn(0, 0)
    const [a1, d1] = fn(1, 0)
    const [b1, e1] = fn(0, 1)
    return { a: a1 - c, b: b1 - c, c, d: d1 - f, e: e1 - f, f }
  }
  const apply = (s, { a, b, c, d, e, f }) => {
    for (let i = 0; i < s.count; i++) {
      const x = s.x[i]
      const y = s.y[i]
      s.x[i] = a * x + b * y + c
      s.y[i] = d * x + e * y + f
    }
  }
  const radiusTable = b => {
    const n = b.radii.length
    return { ...b, radiusAt: theta => { const k = ((theta / (Math.PI * 2)) % 1 + 1) % 1 * n; const i = Math.floor(k) % n; const t = k - Math.floor(k); return b.radii[i] + (b.radii[(i + 1) % n] - b.radii[i]) * t } }
  }

  worker.onmessage = ({ data: m }) => {
    if (m.type !== 'state') return
    const now = performance.now()
    const s = { count: m.count, x: m.x, y: m.y, vx: m.vx, vy: m.vy, temp: m.temp, id: m.id, at: now, generation: m.generation }
    // A state computed before a turn the page already made is brought through the turn.
    for (const t of turns) if (t.generation > s.generation) apply(s, t.map)
    s.generation = generation
    if (latest) gap += ((now - latest.at) - gap) * 0.1
    previous = latest
    latest = s
    // Where each particle (by birth index) sits in the previous state, for the interpolation:
    // the simulation sorts its particles into cell order every step, so the same slot holds a
    // different particle from one state to the next, and interpolating slot against slot drew
    // lava flying between strangers (holes and a ragged edge whenever the pool moved).
    if (previous) {
      let top = 0
      for (let k = 0; k < previous.count; k++) if (previous.id[k] > top) top = previous.id[k]
      if (slotOf.length <= top) { slotOf = new Int32Array(top * 2 + 16); slotGen = new Int32Array(top * 2 + 16) }
      slotBuild++
      for (let k = 0; k < previous.count; k++) { const b = previous.id[k]; slotOf[b] = k; slotGen[b] = slotBuild }
    }
    state.x = s.x; state.y = s.y; state.vx = s.vx; state.vy = s.vy; state.temp = s.temp; state.id = s.id
    stepMs += (m.stepMs - stepMs) * 0.1
    steps++
    width = m.width
    height = m.height
    const w = m.world
    elements = w.elements
    flow = w.flow || null
    heater = w.heater || null
    if (w.cups) {
      cups = w.cups
      bottles = cups.bottles.map(radiusTable)
      floorBottles = cups.floorBottles.map(radiusTable)
    }
  }

  worker.postMessage({ type: 'init', seed, params, width, height, frame, pace, want })

  return {
    remote: true,
    // Once a frame: hand over the inputs and ask for what the overlays need this frame.
    frame (paceNow, wantNow) {
      const json = JSON.stringify(params)
      const changed = json !== sentParams
      sentParams = json
      worker.postMessage({ type: 'frame', params: changed ? params : null, touches, push, light, eddy, pulse, flip: flip.splice(0), vent, charge, release, retire, pace: paceNow, want: wantNow })
      push = null
      light = 0
      eddy = 0
      pulse = 0
      vent = {}
      release = {}
      retire = []
      if (!wantNow.cups) { cups = null }
    },
    // Fill `shown` with the positions for this instant, between the last two states, and give
    // back how many there are.
    interpolate (shown, now) {
      if (!latest) return 0
      const n = latest.count
      if (shown.x.length < n) { shown.x = new Float32Array(n); shown.y = new Float32Array(n) }
      shown.temp = latest.temp
      const t = previous && previous.generation === latest.generation ? Math.min(1, Math.max(0, (now - latest.at) / gap)) : 1
      if (t >= 1) { shown.x.set(latest.x.subarray(0, n)); shown.y.set(latest.y.subarray(0, n)); return n }
      const { id, x, y } = latest
      for (let i = 0; i < n; i++) {
        const b = id[i]
        if (b >= slotOf.length || slotGen[b] !== slotBuild) { shown.x[i] = x[i]; shown.y[i] = y[i]; continue } // born since the previous state
        const k = slotOf[b]
        shown.x[i] = previous.x[k] + (x[i] - previous.x[k]) * t
        shown.y[i] = previous.y[k] + (y[i] - previous.y[k]) * t
      }
      return n
    },
    step () {}, // the worker steps itself
    resize (w, h) { width = w; height = h; worker.postMessage({ type: 'resize', width: w, height: h }) },
    push (fx, fy) { push = push ? [push[0] + fx, push[1] + fy] : [fx, fy] },
    lightElement () { light++ },
    spawnEddy () { eddy++ },
    pulseWave () { pulse++ },
    flipEddies (chance = 1) { flip.push(chance) },
    ventPot (kind, seconds) { vent[kind] = Math.max(vent[kind] || 0, seconds || 0) },
    chargePots (levels) { charge = { drop: 0, boom: 0, beat: 0, ...levels } },
    retirePot (kind) { retire.push(kind) },
    releasePot (kind, strength) { release[kind] = Math.max(release[kind] || 0, strength || 0) },
    setTouches (list) { touches = list || [] },
    transform (fn) {
      const map = affine(fn)
      generation++
      turns.push({ generation, map })
      if (turns.length > 8) turns.shift()
      if (latest) { apply(latest, map); latest.generation = generation }
      if (previous) { apply(previous, map); previous.generation = generation }
      worker.postMessage({ type: 'transform', ...map, generation })
    },
    flowAt (px, py) {
      if (!flow) return [0, 0]
      const c = Math.min(flow.cols - 1, Math.max(0, Math.round((px - flow.step / 2) / flow.step)))
      const r = Math.min(flow.rows - 1, Math.max(0, Math.round((py - flow.step / 2) / flow.step)))
      const o = (c + r * flow.cols) * 2
      return [flow.data[o], flow.data[o + 1]]
    },
    heaterAt (px) {
      if (!heater) return 0
      return heater.data[Math.min(heater.data.length - 1, Math.max(0, Math.floor(px / heater.cell)))]
    },
    heaterElements: () => elements,
    ceilingAt: px => cups ? cups.ceiling[Math.min(cups.ceiling.length - 1, Math.max(0, Math.round(px)))] : 0,
    floorAt: px => cups ? cups.floor[Math.min(cups.floor.length - 1, Math.max(0, Math.round(px)))] : height,
    bottles: () => bottles,
    floorBottles: () => floorBottles,
    profile: () => ({ stepMs, steps, gap }),
    get state () { return state },
    get count () { return latest ? latest.count : 0 },
    get width () { return width },
    get height () { return height }
  }
}
