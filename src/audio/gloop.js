// Sound from the lava, made up as it moves (Robert: "could we add sound effects? like glooping
// noises generated from the current globbing situation?"). Nothing is recorded: every sound is
// synthesised on the spot from what the particles are doing this frame, so the gloops land on
// the snaps that cause them.
//
// Two layers. Bloops: when the number of fast particles in a column of the lamp jumps between
// two frames, a neck has snapped or a blob has landed there, and a short rising sine with a
// little noise is played at that column's pan, pitched by how much lava was moving (more lava,
// lower note) and as loud as the jump was sudden. And a bed that follows how agitated the
// visible lava is (its mean speed against gravity), in one of three voices (Robert, of the
// first, noise: "I like the effect but not really the sound, what other options do we have?"):
//   simmer  a scatter of tiny pops, more and lower as the lava stirs, like a pot coming to the boil
//   noise   brownish noise through a lowpass that opens with the stirring, the first pass
//   hum     a low two-tone drone that swells with the stirring, the sound of a lamp's base
// Robert's first notes: "The bubble sound pitch should match the size of the event, and be a
// little lower and slower at the current levels", so the bloop runs from about 350 Hz for a speck
// down to 75 Hz for a big snap, over half a second.
//
// Robert suggested buffering frames and streaming audio from them; that is not needed, Web Audio
// schedules every sound a few ms ahead and the ear does not notice sound a frame behind the eye,
// so the synth reads the live state. The AudioContext is made on the toggle's click, which is
// the user gesture browsers want before any sound; `set` resolves once sound is actually
// running, so the switch can show it is still warming up.
export const BEDS = ['simmer', 'noise', 'hum', 'none']
const COLUMNS = 12
const FAST = 0.5 // a particle is fast above this many gravities
const MIN_BURST = 0.0006 // of the visible count: the jump in fast particles that is a bloop
const COOLDOWN = 0.16 // seconds between bloops in one column
const BLOOP_LEVEL = 0.5
const BLOOP_LOW = 48 // Hz, the floor of the bloop's pitch
const BLOOP_SPAN = 300 // Hz above it for a speck
const BLOOP_SLOW = 1.5 // stretches every bloop envelope; 1 was the first pass
const NOISE_LEVEL = 0.22
const HUM_LEVEL = 0.16
const SIMMER_RATE = [1.5, 28] // pops per second at rest and at full agitation
const SIMMER_LEVEL = [0.05, 0.16]

export function createGloop () {
  let context = null
  let master = null
  let noiseBuffer = null
  let noise = null // { gain, filter }
  let hum = null // { gain, filter, lfo }
  let bed = 'simmer'
  let enabled = false
  let agitation = 0
  let primed = false
  let ready = null // resolves the promise from set() once sound is running
  const fast = new Float32Array(COLUMNS)
  const prevFast = new Float32Array(COLUMNS)
  const lastBloop = new Float64Array(COLUMNS)
  let time = 0
  const stats = { bloops: 0, pops: 0, agitation: 0 } // for poking from the console

  function start () {
    if (context) { if (context.state === 'suspended') context.resume(); return }
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    context = new Ctx()
    master = context.createGain()
    master.gain.value = 0.8
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
    // The hum: two low sines a fifth apart, a slow wobble on their level, through a lowpass.
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
    hum = { gain: hg, filter: hf, lfo }
  }

  function stop () {
    if (context && context.state === 'running') context.suspend()
  }

  // One bloop: a sine that rises like a drop, a little bandpassed noise on top, panned. `size`
  // 0 for a speck to 1 for a big snap sets the pitch; `strength` the level; `speed` shortens it.
  function bloop (pan, size, strength, speed = 1) {
    const t = context.currentTime + 0.01
    const slow = BLOOP_SLOW / speed
    const f0 = BLOOP_SPAN * Math.exp(-size * 2.4) + BLOOP_LOW
    const osc = context.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(f0 * 2.2, t + 0.11 * slow)
    osc.frequency.exponentialRampToValueAtTime(f0 * 1.6, t + 0.3 * slow)
    const gain = context.createGain()
    const level = BLOOP_LEVEL * strength
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(level, t + 0.006)
    gain.gain.exponentialRampToValueAtTime(level * 0.3, t + 0.12 * slow)
    gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.34 * slow)
    const splash = context.createBufferSource()
    splash.buffer = noiseBuffer
    splash.loop = true
    splash.playbackRate.value = 0.5 + Math.random()
    const band = context.createBiquadFilter()
    band.type = 'bandpass'; band.frequency.value = f0 * 5; band.Q.value = 2
    const splashGain = context.createGain()
    splashGain.gain.setValueAtTime(level * 0.35, t)
    splashGain.gain.exponentialRampToValueAtTime(0.0005, t + 0.1 * slow)
    const panner = context.createStereoPanner ? context.createStereoPanner() : null
    const out = panner || master
    if (panner) { panner.pan.value = Math.max(-0.8, Math.min(0.8, pan)); panner.connect(master) }
    osc.connect(gain); gain.connect(out)
    splash.connect(band); band.connect(splashGain); splashGain.connect(out)
    osc.start(t); osc.stop(t + 0.36 * slow)
    splash.start(t); splash.stop(t + 0.12 * slow)
  }

  // Read this frame's lava. `state` has x, y, vx, vy; `count` live particles; gravity in px/s.
  function update (state, count, width, height, gravity, dt) {
    if (!enabled || !context || context.state !== 'running') return
    if (ready) { ready(); ready = null }
    time += dt
    fast.fill(0)
    let visible = 0
    let speedSum = 0
    const thr = FAST * gravity
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
    const target = Math.min(1, speedSum / visible / gravity * 3)
    if (!primed) { agitation = target; primed = true }
    agitation += (target - agitation) * Math.min(1, dt * 3)
    stats.agitation = agitation
    const now = context.currentTime
    noise.gain.gain.setTargetAtTime(bed === 'noise' ? NOISE_LEVEL * agitation * agitation : 0, now, 0.05)
    noise.filter.frequency.setTargetAtTime(140 + 500 * agitation, now, 0.05)
    hum.gain.gain.setTargetAtTime(bed === 'hum' ? HUM_LEVEL * (0.15 + 0.85 * agitation) : 0, now, 0.1)
    hum.filter.frequency.setTargetAtTime(120 + 300 * agitation, now, 0.1)
    if (bed === 'simmer') {
      // Tiny pops, Poisson in time, placed where the lava is moving most, lower as it stirs more.
      const rate = SIMMER_RATE[0] + (SIMMER_RATE[1] - SIMMER_RATE[0]) * agitation * agitation
      if (Math.random() < rate * dt) {
        let total = 0
        for (let c = 0; c < COLUMNS; c++) total += fast[c] + 0.5
        let pick = Math.random() * total
        let col = 0
        for (; col < COLUMNS - 1; col++) { pick -= fast[col] + 0.5; if (pick <= 0) break }
        const size = Math.random() * 0.25 + 0.3 * agitation
        const level = SIMMER_LEVEL[0] + (SIMMER_LEVEL[1] - SIMMER_LEVEL[0]) * Math.random()
        bloop((col + 0.5) / COLUMNS * 2 - 1, size, level / BLOOP_LEVEL, 2.2)
        stats.pops++
      }
    }
    // Bloops where the fast count jumped.
    const minBurst = Math.max(3, MIN_BURST * visible)
    for (let c = 0; c < COLUMNS; c++) {
      const burst = fast[c] - prevFast[c]
      if (burst >= minBurst && time - lastBloop[c] >= COOLDOWN) {
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
    get bed () { return bed },
    get enabled () { return enabled },
    get stats () { return { ...stats, bed, state: context ? context.state : 'off' } }
  }
}
