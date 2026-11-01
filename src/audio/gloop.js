// Sound from the lava, made up as it moves (Robert: "could we add sound effects? like glooping
// noises generated from the current globbing situation?"). Nothing is recorded: every sound is
// synthesised on the spot from what the particles are doing this frame, so the gloops land on
// the snaps that cause them. Robert's brief, after hearing the first passes: "no one knows what
// a lava lamp sounds like. But I can imagine, it probably sounds kinda like a thick liquid like
// honey pouring out of a jug."
//
// Two layers. Bloops: when the number of fast particles in a column of the lamp jumps between
// two frames, a neck has snapped or a blob has landed there, and a short rising sine with a
// little noise is played at that column's pan, pitched by how much lava was moving (more lava,
// lower note) and as loud as the jump was sudden. And a bed that follows how agitated the
// visible lava is (its mean speed against gravity), in one of four voices:
//   simmer  a scatter of tiny pops, more and lower as the lava stirs, like a pot coming to the boil
//   glug    the jug: a low tone that bends down as air gets in, repeating as fast as the lava pours
//   noise   brownish noise through a lowpass that opens with the stirring, the first pass
//   hum     a low two-tone drone that swells with the stirring, the sound of a lamp's base
//
// Every number is in `tune`, live, so the sound board (experiments/sound.html) can turn them
// while the lava runs; TUNE holds the defaults. Robert suggested buffering frames and streaming
// audio from them; that is not needed, Web Audio schedules every sound a few ms ahead and the
// ear does not notice sound a frame behind the eye, so the synth reads the live state. The
// AudioContext is made on the toggle's click, which is the user gesture browsers want before
// any sound; `set` resolves once sound is actually running, so the switch can show it warming up.
export const BEDS = ['simmer', 'glug', 'noise', 'hum', 'none']
// The events the lava can fire, each with a tick of its own for checking the detection by ear
// against the eye (Robert: "the correlation of the visual to the audio still seems off. I think
// we should create like 5 different tick sounds that we can use to identify the start of an
// event so I can say when there should be a tick or when there is one that shouldn't be there").
// A burst is a jump in a column's count of fast particles; it is a snap when those particles
// move both ways (a neck's recoil), a lift when they mostly rise, a land when they mostly fall.
// Pour is lava crossing the floor line into or out of the pots, spill the same at the lip.
// Merge is two blobs joining (Robert, with a picture of a blob landing on the pool's shoulder:
// "I think this should make like a GALooooOOOOOooPP sound"): the visible lava is labelled into
// connected components on a coarse grid twenty times a second, and a component that covers two
// of the last labelling's, both of age and both at least `blob` of the lava, is a merge.
export const EVENTS = ['snap', 'lift', 'land', 'pour', 'spill', 'merge']
export const TUNE = {
  master: 0.8,
  fast: 0.5, // a particle is fast above this many gravities
  burst: 0.0006, // of the visible count: the jump in fast particles in a column that is a bloop
  cooldown: 0.16, // seconds between bloops in one column
  bloopLevel: 0.5,
  bloopLow: 48, // Hz, the floor of the bloop's pitch (a big snap)
  bloopSpan: 300, // Hz above it for a speck
  bloopSlow: 1.5, // stretches every bloop envelope; 1 was the first pass
  bloopSplash: 0.35, // the noise splash on a bloop, as a share of its level
  simmerRateLow: 1.5, // pops a second with the lava at rest
  simmerRateHigh: 28, // and at full agitation
  simmerLevel: 0.1,
  simmerSpeed: 2.2, // how much shorter a pop is than a bloop
  glugRateLow: 0.4, // glugs a second with the lava at rest
  glugRateHigh: 6, // and at full agitation
  glugLevel: 0.35,
  glugLow: 42, // Hz, the floor of a glug's pitch
  glugSpan: 120, // Hz above it for the smallest pour
  glugSlow: 1, // stretches the glug
  glugBreath: 0.5, // the puff of air on a glug, as a share of its level
  galoopLevel: 0.5, // the merge voice
  galoopLow: 70, // Hz, the floor of its pitch (a big merge)
  galoopSpan: 160, // Hz above it for a small one
  galoopSlow: 1, // stretches it
  blob: 0.01, // of the visible count: the smaller side of a merge must be at least this much lava
  noiseLevel: 0.22,
  humLevel: 0.16,
  agitationGain: 3 // mean speed in gravities times this is the agitation, capped at 1
}
const COLUMNS = 12
const BLOB_COLS = 32 // at most this many cells across the lamp for the blob labelling; a cell is never under 1.5 particle radii, or a blob breaks into pieces between its particles
const BLOB_EVERY = 0.05 // seconds of lamp time between labellings
const BLOB_AGE = 6 // labellings a component must have existed before it can take part in a merge

export function createGloop (tune = {}) {
  const T = { ...TUNE, ...tune }
  let context = null
  let master = null
  let noiseBuffer = null
  let noise = null // { gain, filter }
  let hum = null // { gain, filter }
  let bed = 'simmer'
  let enabled = false
  let agitation = 0
  let primed = false
  let ready = null // resolves the promise from set() once sound is running
  const fast = new Float32Array(COLUMNS)
  const prevFast = new Float32Array(COLUMNS)
  const lastBloop = new Float64Array(COLUMNS)
  let time = 0
  let lastGlug = -1
  let ticks = false // play a tick per event instead of the voices
  let silent = false // detect and report events, play nothing (the evolution page records clips this way)
  let onEvent = null // the sound board's hook: fn({ type, x, y, size, strength, time })
  let prevY = new Float32Array(0) // last frame's y per particle, by birth index when the state has ids (the CPU step sorts its slots every step), for the line crossings
  let prevStamp = new Int32Array(0) // which frame each prevY entry is from
  let frameStamp = 0
  const up = new Float32Array(COLUMNS) // this frame's fast particles rising, per column
  const down = new Float32Array(COLUMNS)
  const sumY = new Float32Array(COLUMNS) // and where they are
  const crossFloor = new Float32Array(COLUMNS)
  const crossLip = new Float32Array(COLUMNS)
  const lastCross = new Float64Array(COLUMNS * 2)
  const stats = { bloops: 0, pops: 0, glugs: 0, galoops: 0, agitation: 0, snap: 0, lift: 0, land: 0, pour: 0, spill: 0, merge: 0 } // for the sound board's readout

  function start () {
    if (context) { if (context.state === 'suspended') context.resume(); return }
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    context = new Ctx()
    master = context.createGain()
    master.gain.value = T.master
    const limiter = context.createDynamicsCompressor()
    limiter.threshold.value = -12
    limiter.ratio.value = 8
    master.connect(limiter)
    limiter.connect(context.destination)
    // Two seconds of brownish noise (a random walk pulled back to zero, a rumble not a hiss),
    // looped, for the noise bed and the bloops' splash.
    noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < data.length; i++) { last = last * 0.98 + (Math.random() * 2 - 1) * 0.3; data[i] = last }
    const source = context.createBufferSource()
    source.buffer = noiseBuffer
    source.loop = true
    const nf = context.createBiquadFilter()
    nf.type = 'lowpass'; nf.frequency.value = 180; nf.Q.value = 1.2
    const ng = context.createGain()
    ng.gain.value = 0
    source.connect(nf); nf.connect(ng); ng.connect(master)
    source.start()
    noise = { gain: ng, filter: nf }
    // The hum: three low sines, a slow wobble on their level, through a lowpass.
    const hg = context.createGain()
    hg.gain.value = 0
    const hf = context.createBiquadFilter()
    hf.type = 'lowpass'; hf.frequency.value = 220
    for (const [f, level] of [[55, 1], [82.4, 0.5], [110, 0.25]]) {
      const osc = context.createOscillator()
      osc.type = 'sine'; osc.frequency.value = f
      const g = context.createGain(); g.gain.value = level
      osc.connect(g); g.connect(hf); osc.start()
    }
    const lfo = context.createOscillator()
    lfo.frequency.value = 0.35
    const lfoGain = context.createGain(); lfoGain.gain.value = 0.3
    const wobble = context.createGain(); wobble.gain.value = 0.7
    lfo.connect(lfoGain); lfoGain.connect(wobble.gain); lfo.start()
    hf.connect(wobble); wobble.connect(hg); hg.connect(master)
    hum = { gain: hg, filter: hf }
  }

  function stop () {
    if (context && context.state === 'running') context.suspend()
  }

  function panner (pan) {
    if (!context.createStereoPanner) return master
    const p = context.createStereoPanner()
    p.pan.value = Math.max(-0.8, Math.min(0.8, pan))
    p.connect(master)
    return p
  }

  // A splash or a breath: the noise buffer through a filter, fading out over `seconds`.
  function puff (out, t, level, seconds, type, frequency, q = 1) {
    const src = context.createBufferSource()
    src.buffer = noiseBuffer
    src.loop = true
    src.playbackRate.value = 0.5 + Math.random()
    const filter = context.createBiquadFilter()
    filter.type = type; filter.frequency.value = frequency; filter.Q.value = q
    const gain = context.createGain()
    gain.gain.setValueAtTime(level, t)
    gain.gain.exponentialRampToValueAtTime(0.0005, t + seconds)
    src.connect(filter); filter.connect(gain); gain.connect(out)
    src.start(t); src.stop(t + seconds + 0.02)
  }

  // One bloop: a sine that rises like a drop, a little bandpassed noise on top, panned. `size`
  // 0 for a speck to 1 for a big snap sets the pitch; `strength` the level; `speed` shortens it.
  function bloop (pan, size, strength, speed = 1) {
    const t = context.currentTime + 0.01
    const slow = T.bloopSlow / speed
    const f0 = T.bloopSpan * Math.exp(-size * 2.4) + T.bloopLow
    const level = T.bloopLevel * strength
    const out = panner(pan)
    const osc = context.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(f0 * 2.2, t + 0.11 * slow)
    osc.frequency.exponentialRampToValueAtTime(f0 * 1.6, t + 0.3 * slow)
    const gain = context.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(level, t + 0.006)
    gain.gain.exponentialRampToValueAtTime(level * 0.3, t + 0.12 * slow)
    gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.34 * slow)
    osc.connect(gain); gain.connect(out)
    osc.start(t); osc.stop(t + 0.36 * slow)
    if (T.bloopSplash > 0) puff(out, t, level * T.bloopSplash, 0.1 * slow, 'bandpass', f0 * 5, 2)
  }

  // One glug: the jug. A low sine that blips up as the pour starts and bends down as the air
  // gets in, rounder and longer than a bloop, with a soft puff of breath at the start.
  function glug (pan, size, strength) {
    const t = context.currentTime + 0.01
    const slow = T.glugSlow
    const f0 = T.glugSpan * Math.exp(-size * 2) + T.glugLow
    const level = T.glugLevel * strength
    const out = panner(pan)
    const osc = context.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(f0 * 0.8, t)
    osc.frequency.exponentialRampToValueAtTime(f0 * 1.35, t + 0.05 * slow)
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.38 * slow)
    const gain = context.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(level, t + 0.02 * slow)
    gain.gain.setValueAtTime(level, t + 0.12 * slow)
    gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.5 * slow)
    // A touch of second harmonic gives it a throat.
    const osc2 = context.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(f0 * 1.6, t)
    osc2.frequency.exponentialRampToValueAtTime(f0 * 2.7, t + 0.05 * slow)
    osc2.frequency.exponentialRampToValueAtTime(f0 * 1.1, t + 0.38 * slow)
    const gain2 = context.createGain()
    gain2.gain.setValueAtTime(0, t)
    gain2.gain.linearRampToValueAtTime(level * 0.25, t + 0.03 * slow)
    gain2.gain.exponentialRampToValueAtTime(0.0005, t + 0.3 * slow)
    osc.connect(gain); gain.connect(out)
    osc2.connect(gain2); gain2.connect(out)
    osc.start(t); osc.stop(t + 0.52 * slow)
    osc2.start(t); osc2.stop(t + 0.32 * slow)
    if (T.glugBreath > 0) puff(out, t, level * T.glugBreath, 0.14 * slow, 'lowpass', 500, 0.7)
  }

  // The merge voice, GALooooOOOOOooPP: a breathy consonant, a sine sliding up a fifth and
  // swelling with a second harmonic for a throat, then dropping into a low thud. Bigger merges
  // sit lower.
  function galoop (pan, size, strength) {
    const t = context.currentTime + 0.01
    const slow = T.galoopSlow
    const f0 = T.galoopLow + T.galoopSpan * Math.exp(-size * 2.4)
    const level = T.galoopLevel * (0.5 + 0.5 * strength)
    const out = panner(pan)
    puff(out, t, level * 0.5, 0.06 * slow, 'bandpass', 900, 1.2)
    const osc = context.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(f0 * 1.5, t + 0.45 * slow)
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + 0.6 * slow)
    const gain = context.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(level, t + 0.08 * slow)
    gain.gain.setValueAtTime(level, t + 0.4 * slow)
    gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.62 * slow)
    const osc2 = context.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(f0 * 2, t)
    osc2.frequency.exponentialRampToValueAtTime(f0 * 3, t + 0.45 * slow)
    const gain2 = context.createGain()
    gain2.gain.setValueAtTime(0, t)
    gain2.gain.linearRampToValueAtTime(level * 0.3, t + 0.1 * slow)
    gain2.gain.exponentialRampToValueAtTime(0.0005, t + 0.5 * slow)
    osc.connect(gain); gain.connect(out)
    osc2.connect(gain2); gain2.connect(out)
    osc.start(t); osc.stop(t + 0.64 * slow)
    osc2.start(t); osc2.stop(t + 0.52 * slow)
    puff(out, t + 0.58 * slow, level * 0.6, 0.08 * slow, 'lowpass', 300, 0.7)
  }

  // The ticks, one timbre per event, short enough to place in time by ear:
  //   snap   a click, 2 kHz square, 25 ms
  //   lift   a chirp rising 400 to 900 Hz
  //   land   a chirp falling 900 to 300 Hz
  //   pour   a thud, 110 Hz sine
  //   spill  two clicks at 1.3 kHz, 70 ms apart
  //   merge  two triangle notes, 500 then 750 Hz
  function tick (type, pan) {
    const t = context.currentTime + 0.005
    const out = panner(pan)
    const tone = (shape, f0, f1, start, length, level) => {
      const osc = context.createOscillator()
      osc.type = shape
      osc.frequency.setValueAtTime(f0, t + start)
      if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + start + length)
      const g = context.createGain()
      g.gain.setValueAtTime(level, t + start)
      g.gain.exponentialRampToValueAtTime(0.0005, t + start + length)
      osc.connect(g); g.connect(out)
      osc.start(t + start); osc.stop(t + start + length + 0.01)
    }
    if (type === 'snap') tone('square', 2000, 2000, 0, 0.025, 0.25)
    else if (type === 'lift') tone('sine', 400, 900, 0, 0.07, 0.4)
    else if (type === 'land') tone('sine', 900, 300, 0, 0.07, 0.4)
    else if (type === 'pour') tone('sine', 110, 110, 0, 0.08, 0.5)
    else if (type === 'spill') { tone('square', 1300, 1300, 0, 0.02, 0.2); tone('square', 1300, 1300, 0.07, 0.02, 0.2) }
    else if (type === 'merge') { tone('triangle', 500, 500, 0, 0.04, 0.3); tone('triangle', 750, 750, 0.06, 0.06, 0.3) }
  }

  // An event the lava fired: a tick or a voice, and the board's hook.
  function fire (type, c, y, size, strength) {
    const x = (c + 0.5) / COLUMNS
    const pan = x * 2 - 1
    stats[type]++
    if (silent) { /* the hook alone */ }
    else if (ticks) tick(type, pan)
    else if (type === 'snap' || type === 'lift' || type === 'land') { bloop(pan, size, strength); stats.bloops++ }
    else if (type === 'merge') { galoop(pan, size, strength); stats.galoops++ }
    if (onEvent) onEvent({ type, x, y, size, strength, time })
  }

  // Pick a column to place a bed sound in, weighted by where the lava is moving.
  function busyColumn () {
    let total = 0
    for (let c = 0; c < COLUMNS; c++) total += fast[c] + 0.5
    let pick = Math.random() * total
    let col = 0
    for (; col < COLUMNS - 1; col++) { pick -= fast[col] + 0.5; if (pick <= 0) break }
    return (col + 0.5) / COLUMNS * 2 - 1
  }

  // Read this frame's lava. `state` has x, y, vx, vy; `count` live particles; gravity in px/s.
  // Blob tracking for the merge event: the visible lava counted into a coarse grid, the
  // occupied cells labelled into 8-connected components, each matched to the last labelling by
  // the cells it took over. A component made of two old ones that were both blobs (at least
  // T.blob of the lava) and both around for BLOB_AGE labellings is a merge; the event sits
  // between their centres and its size is the smaller one's share of the lava.
  let blobCols = 0
  let blobRows = 0
  let cellCount = new Float32Array(0)
  let cellX = new Float32Array(0)
  let cellY = new Float32Array(0)
  let label = new Int32Array(0)
  let prevLabel = new Int32Array(0)
  let prevComps = []
  let blobDue = 0
  let lastMerge = -1
  const stack = []
  function trackBlobs (state, count, width, height, visible, radius) {
    const cell = Math.max(width / BLOB_COLS, radius * 1.5)
    const cols = Math.max(1, Math.ceil(width / cell))
    const rows = Math.max(1, Math.ceil(height / cell))
    if (cols !== blobCols || rows !== blobRows) {
      blobCols = cols; blobRows = rows
      const n = cols * rows
      cellCount = new Float32Array(n); cellX = new Float32Array(n); cellY = new Float32Array(n)
      label = new Int32Array(n); prevLabel = new Int32Array(n).fill(-1); prevComps = []
    }
    cellCount.fill(0); cellX.fill(0); cellY.fill(0)
    const { x, y } = state
    for (let i = 0; i < count; i++) {
      const py = y[i]
      if (py < 0 || py > height) continue
      let c = Math.floor(x[i] / cell); if (c < 0) c = 0; else if (c >= cols) c = cols - 1
      let r = Math.floor(py / cell); if (r >= rows) r = rows - 1
      const k = c + r * cols
      cellCount[k]++; cellX[k] += x[i]; cellY[k] += py
    }
    label.fill(-1)
    const comps = []
    for (let k0 = 0; k0 < label.length; k0++) {
      if (cellCount[k0] === 0 || label[k0] >= 0) continue
      const id = comps.length
      const comp = { size: 0, x: 0, y: 0, age: 0, from: new Map() }
      comps.push(comp)
      stack.length = 0
      stack.push(k0)
      while (stack.length) {
        const k = stack.pop()
        if (label[k] >= 0) continue
        label[k] = id
        comp.size += cellCount[k]; comp.x += cellX[k]; comp.y += cellY[k]
        const old = prevLabel[k]
        if (old >= 0) comp.from.set(old, (comp.from.get(old) || 0) + cellCount[k])
        const c = k % cols
        const r = (k - c) / cols
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const cc = c + dc
            const rr = r + dr
            if (cc < 0 || cc >= cols || rr < 0 || rr >= rows) continue
            const j = cc + rr * cols
            if (cellCount[j] > 0 && label[j] < 0) stack.push(j)
          }
        }
      }
      comp.x /= comp.size; comp.y /= comp.size
    }
    const minBlob = Math.max(10, T.blob * visible)
    for (const comp of comps) {
      let age = 0
      const parts = []
      for (const [old, n] of comp.from) {
        const p = prevComps[old]
        if (!p) continue
        if (p.age > age) age = p.age
        if (p.size >= minBlob && n >= p.size * 0.5 && p.age >= BLOB_AGE) parts.push(p)
      }
      comp.age = age + 1
      if (parts.length >= 2 && time - lastMerge >= T.cooldown * 2) {
        parts.sort((a, b) => b.size - a.size)
        const [a, b] = parts
        lastMerge = time
        let c = Math.floor((a.x + b.x) / 2 / width * COLUMNS); if (c < 0) c = 0; else if (c >= COLUMNS) c = COLUMNS - 1
        fire('merge', c, (a.y + b.y) / 2 / height, Math.min(1, b.size / (0.1 * visible)), Math.min(1, 2 * b.size / a.size))
      }
    }
    prevLabel.set(label)
    prevComps = comps
  }

  function update (state, count, width, height, gravity, dt, radius = 20) {
    if (!enabled || !context || context.state !== 'running') return
    if (ready) { ready(); ready = null }
    time += dt
    fast.fill(0); up.fill(0); down.fill(0); sumY.fill(0); crossFloor.fill(0); crossLip.fill(0)
    let visible = 0
    let speedSum = 0
    const thr = T.fast * gravity
    const { x, y, vx, vy, id } = state
    let top = count
    if (id) for (let i = 0; i < count; i++) if (id[i] >= top) top = id[i] + 1
    if (prevY.length < top) {
      const ny = new Float32Array(top * 2); ny.set(prevY)
      const ns = new Int32Array(top * 2); ns.set(prevStamp)
      prevY = ny; prevStamp = ns
    }
    const lastStamp = frameStamp
    frameStamp++
    for (let i = 0; i < count; i++) {
      const py = y[i]
      let c = Math.floor(x[i] / width * COLUMNS)
      if (c < 0) c = 0; else if (c >= COLUMNS) c = COLUMNS - 1
      const b = id ? id[i] : i
      if (prevStamp[b] === lastStamp) {
        const was = prevY[b]
        if ((was <= height) !== (py <= height)) crossFloor[c]++
        if ((was < 0) !== (py < 0)) crossLip[c]++
      }
      prevY[b] = py
      prevStamp[b] = frameStamp
      if (py < 0 || py > height) continue
      visible++
      const s = Math.hypot(vx[i], vy[i])
      speedSum += s
      if (s > thr) {
        fast[c]++
        sumY[c] += py
        if (vy[i] < -thr * 0.7) up[c]++; else if (vy[i] > thr * 0.7) down[c]++
      }
    }
    if (visible === 0) return
    blobDue += dt
    if (blobDue >= BLOB_EVERY) { blobDue = 0; trackBlobs(state, count, width, height, visible, radius) }
    // Agitation: the mean speed against gravity, eased so the bed swells and fades rather than
    // flickers; a lifting lamp sits about half way, the warm-up pins it.
    const target = Math.min(1, speedSum / visible / gravity * T.agitationGain)
    if (!primed) { agitation = target; primed = true }
    agitation += (target - agitation) * Math.min(1, dt * 3)
    stats.agitation = agitation
    const now = context.currentTime
    master.gain.setTargetAtTime(T.master, now, 0.05)
    noise.gain.gain.setTargetAtTime(bed === 'noise' && !silent ? T.noiseLevel * agitation * agitation : 0, now, 0.05)
    noise.filter.frequency.setTargetAtTime(140 + 500 * agitation, now, 0.05)
    hum.gain.gain.setTargetAtTime(bed === 'hum' && !silent ? T.humLevel * (0.15 + 0.85 * agitation) : 0, now, 0.1)
    hum.filter.frequency.setTargetAtTime(120 + 300 * agitation, now, 0.1)
    if (ticks || silent) { /* the voices are quiet */ } else if (bed === 'simmer') {
      // Tiny pops, Poisson in time, placed where the lava is moving most, lower as it stirs more.
      const rate = T.simmerRateLow + (T.simmerRateHigh - T.simmerRateLow) * agitation * agitation
      if (Math.random() < rate * dt) {
        const size = Math.random() * 0.25 + 0.3 * agitation
        const level = T.simmerLevel * (0.5 + Math.random())
        bloop(busyColumn(), size, level / T.bloopLevel, T.simmerSpeed)
        stats.pops++
      }
    } else if (bed === 'glug') {
      // The jug glugs as fast as the lava pours, bigger pours lower, never two on top of each other.
      const rate = T.glugRateLow + (T.glugRateHigh - T.glugRateLow) * agitation
      if (Math.random() < rate * dt && time - lastGlug > 0.12) {
        lastGlug = time
        const size = Math.min(1, 0.2 + agitation * 0.8 + (Math.random() - 0.5) * 0.3)
        glug(busyColumn(), size, 0.6 + 0.4 * Math.random())
        stats.glugs++
      }
    }
    // Bursts where the fast count jumped: a snap, a lift or a land by which way the fast
    // particles are going. And the line crossings, pours and spills.
    const minBurst = Math.max(3, T.burst * visible)
    for (let c = 0; c < COLUMNS; c++) {
      const burst = fast[c] - prevFast[c]
      if (burst >= minBurst && time - lastBloop[c] >= T.cooldown) {
        lastBloop[c] = time
        const size = Math.min(1, fast[c] / (0.02 * visible)) // 0 a speck, 1 two percent of the lava moving at once
        const strength = Math.min(1, burst / (minBurst * 6))
        const meanY = sumY[c] / fast[c] / height
        const type = up[c] > 2 * down[c] ? 'lift' : down[c] > 2 * up[c] ? 'land' : 'snap'
        fire(type, c, meanY, size, strength)
      }
      prevFast[c] = fast[c]
      if (crossFloor[c] >= minBurst && time - lastCross[c] >= T.cooldown) { lastCross[c] = time; fire('pour', c, 1, Math.min(1, crossFloor[c] / (0.02 * visible)), 1) }
      if (crossLip[c] >= minBurst && time - lastCross[COLUMNS + c] >= T.cooldown) { lastCross[COLUMNS + c] = time; fire('spill', c, 0, Math.min(1, crossLip[c] / (0.02 * visible)), 1) }
    }
  }

  return {
    update,
    // Turn the sound on or off. Call from a click or touch handler the first time. Resolves once
    // sound is running (or at once when turning off or when there is no audio at all).
    set (on) {
      enabled = !!on
      if (!enabled) { stop(); if (ready) { ready(); ready = null } return Promise.resolve() }
      start()
      if (!context) return Promise.resolve()
      return new Promise(resolve => { ready = resolve })
    },
    setBed (name) { bed = BEDS.includes(name) ? name : 'none' },
    // Ticks instead of voices, one timbre per event, for checking the detection by ear.
    setTicks (on) { ticks = !!on },
    setSilent (on) { silent = !!on },
    set onEvent (fn) { onEvent = fn },
    // Play a tick by hand, to learn them.
    playTick (type) { if (context && context.state === 'running') tick(type, 0) },
    // Play one sound by hand (the sound board's buttons): 'bloop' or 'glug', size 0 to 1.
    play (voice, size = 0.5, strength = 1, pan = 0, tune = null) {
      if (!context || context.state !== 'running') return
      // A one-off tune (the evolution page plays each genome's numbers) is swapped in for the call.
      const keep = tune ? { ...T } : null
      if (tune) Object.assign(T, tune)
      if (voice === 'glug') glug(pan, size, strength); else bloop(pan, size, strength, voice === 'pop' ? T.simmerSpeed : 1)
      if (keep) Object.assign(T, keep)
    },
    get agitation () { return agitation },
    tune: T,
    get bed () { return bed },
    get enabled () { return enabled },
    get stats () { return { ...stats, bed, state: context ? context.state : 'off' } },
    // The audio graph, for the sound board's sample player.
    get context () { return context },
    get master () { return master },
    get noiseBuffer () { return noiseBuffer },
    get blobs () { return prevComps.map(c => ({ size: Math.round(c.size), x: Math.round(c.x), y: Math.round(c.y), age: c.age })) }
  }
}
