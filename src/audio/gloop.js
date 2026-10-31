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
  noiseLevel: 0.22,
  humLevel: 0.16,
  agitationGain: 3 // mean speed in gravities times this is the agitation, capped at 1
}
const COLUMNS = 12

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
  const stats = { bloops: 0, pops: 0, glugs: 0, agitation: 0 } // for the sound board's readout

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
  function update (state, count, width, height, gravity, dt) {
    if (!enabled || !context || context.state !== 'running') return
    if (ready) { ready(); ready = null }
    time += dt
    fast.fill(0)
    let visible = 0
    let speedSum = 0
    const thr = T.fast * gravity
    const { x, y, vx, vy } = state
    for (let i = 0; i < count; i++) {
      const py = y[i]
      if (py < 0 || py > height) continue
      visible++
      const s = Math.hypot(vx[i], vy[i])
      speedSum += s
      if (s > thr) {
        let c = Math.floor(x[i] / width * COLUMNS)
        if (c < 0) c = 0; else if (c >= COLUMNS) c = COLUMNS - 1
        fast[c]++
      }
    }
    if (visible === 0) return
    // Agitation: the mean speed against gravity, eased so the bed swells and fades rather than
    // flickers; a lifting lamp sits about half way, the warm-up pins it.
    const target = Math.min(1, speedSum / visible / gravity * T.agitationGain)
    if (!primed) { agitation = target; primed = true }
    agitation += (target - agitation) * Math.min(1, dt * 3)
    stats.agitation = agitation
    const now = context.currentTime
    master.gain.setTargetAtTime(T.master, now, 0.05)
    noise.gain.gain.setTargetAtTime(bed === 'noise' ? T.noiseLevel * agitation * agitation : 0, now, 0.05)
    noise.filter.frequency.setTargetAtTime(140 + 500 * agitation, now, 0.05)
    hum.gain.gain.setTargetAtTime(bed === 'hum' ? T.humLevel * (0.15 + 0.85 * agitation) : 0, now, 0.1)
    hum.filter.frequency.setTargetAtTime(120 + 300 * agitation, now, 0.1)
    if (bed === 'simmer') {
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
    // Bloops where the fast count jumped.
    const minBurst = Math.max(3, T.burst * visible)
    for (let c = 0; c < COLUMNS; c++) {
      const burst = fast[c] - prevFast[c]
      if (burst >= minBurst && time - lastBloop[c] >= T.cooldown) {
        lastBloop[c] = time
        const size = Math.min(1, fast[c] / (0.02 * visible)) // 0 a speck, 1 two percent of the lava moving at once
        const strength = Math.min(1, burst / (minBurst * 6))
        bloop((c + 0.5) / COLUMNS * 2 - 1, size, 0.3 + 0.7 * strength)
        stats.bloops++
      }
      prevFast[c] = fast[c]
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
    // Play one sound by hand (the sound board's buttons): 'bloop' or 'glug', size 0 to 1.
    play (voice, size = 0.5, strength = 1, pan = 0) {
      if (!context || context.state !== 'running') return
      if (voice === 'glug') glug(pan, size, strength); else bloop(pan, size, strength, voice === 'pop' ? T.simmerSpeed : 1)
    },
    tune: T,
    get bed () { return bed },
    get enabled () { return enabled },
    get stats () { return { ...stats, bed, state: context ? context.state : 'off' } }
  }
}
