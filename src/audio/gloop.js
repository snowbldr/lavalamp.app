// Sound from the lava, made up as it moves (Robert: "could we add sound effects? like glooping
// noises generated from the current globbing situation?"). Nothing is recorded: every sound is
// synthesised on the spot from what the particles are doing this frame, so the gloops land on
// the snaps that cause them.
//
// Two layers. A gurgle bed, filtered noise whose level and colour follow how agitated the
// visible lava is (its mean speed against gravity), so a still pool is near silent and a
// churning lamp burbles. And bloops: when the number of fast particles in a column of the lamp
// jumps between two frames, a neck has snapped or a blob has landed there, and a short rising
// sine with a little noise is played at that column's pan, pitched by how much lava was moving
// (more lava, lower note) and as loud as the jump was sudden.
//
// Robert suggested buffering frames and streaming audio from them; that is not needed, Web Audio
// schedules every sound a few ms ahead and the ear does not notice sound a frame behind the eye,
// so the synth reads the live state. The AudioContext is made on the toggle's click, which is
// the user gesture browsers want before any sound.
const COLUMNS = 12
const FAST = 0.5 // a particle is fast above this many gravities
const MIN_BURST = 0.0006 // of the visible count: the jump in fast particles that is a bloop
const COOLDOWN = 0.16 // seconds between bloops in one column
const GURGLE_LEVEL = 0.22 // bed gain at full agitation
const BLOOP_LEVEL = 0.5

export function createGloop () {
  let context = null
  let master = null
  let bed = null
  let bedFilter = null
  let bedGain = null
  let noiseBuffer = null
  let enabled = false
  let agitation = 0
  const fast = new Float32Array(COLUMNS)
  const prevFast = new Float32Array(COLUMNS)
  const lastBloop = new Float64Array(COLUMNS)
  let time = 0
  const stats = { bloops: 0, agitation: 0, state: 'off' } // for poking from the console

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
    // Two seconds of noise, looped, for the bed and the bloops' splash.
    const seconds = 2
    noiseBuffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < data.length; i++) {
      // Brownish: a random walk pulled back to zero, so it rumbles rather than hisses.
      last = last * 0.98 + (Math.random() * 2 - 1) * 0.3
      data[i] = last
    }
    bed = context.createBufferSource()
    bed.buffer = noiseBuffer
    bed.loop = true
    bedFilter = context.createBiquadFilter()
    bedFilter.type = 'lowpass'
    bedFilter.frequency.value = 180
    bedFilter.Q.value = 1.2
    bedGain = context.createGain()
    bedGain.gain.value = 0
    bed.connect(bedFilter)
    bedFilter.connect(bedGain)
    bedGain.connect(master)
    bed.start()
  }

  function stop () {
    if (context && context.state === 'running') context.suspend()
  }

  // One bloop: a sine that rises like a drop, a little bandpassed noise on top, panned.
  function bloop (pan, size, strength) {
    const t = context.currentTime + 0.01
    const f0 = 420 * Math.exp(-size * 1.6) + 70 // more lava moving, lower note: 490 Hz for a speck, ~110 for a big snap
    const osc = context.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(f0 * 2.4, t + 0.11)
    osc.frequency.exponentialRampToValueAtTime(f0 * 1.8, t + 0.3)
    const gain = context.createGain()
    const level = BLOOP_LEVEL * strength
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(level, t + 0.006)
    gain.gain.exponentialRampToValueAtTime(level * 0.3, t + 0.12)
    gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.34)
    const splash = context.createBufferSource()
    splash.buffer = noiseBuffer
    splash.loop = true
    splash.playbackRate.value = 0.5 + Math.random()
    const band = context.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = f0 * 5
    band.Q.value = 2
    const splashGain = context.createGain()
    splashGain.gain.setValueAtTime(level * 0.35, t)
    splashGain.gain.exponentialRampToValueAtTime(0.0005, t + 0.1)
    const panner = context.createStereoPanner ? context.createStereoPanner() : null
    const out = panner || master
    if (panner) { panner.pan.value = Math.max(-0.8, Math.min(0.8, pan)); panner.connect(master) }
    osc.connect(gain); gain.connect(out)
    splash.connect(band); band.connect(splashGain); splashGain.connect(out)
    osc.start(t); osc.stop(t + 0.36)
    splash.start(t); splash.stop(t + 0.12)
  }

  // Read this frame's lava. `state` has x, y, vx, vy; `count` live particles; gravity in px/s.
  function update (state, count, width, height, gravity, dt) {
    if (!enabled || !context || context.state !== 'running') return
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
    // The bed follows agitation, eased so it swells and fades rather than flickers.
    const target = Math.min(1, speedSum / visible / gravity * 3) // a lifting lamp sits about half way; the warm-up pins it
    agitation += (target - agitation) * Math.min(1, dt * 3)
    stats.agitation = agitation
    stats.state = context.state
    const now = context.currentTime
    bedGain.gain.setTargetAtTime(GURGLE_LEVEL * agitation * agitation, now, 0.05)
    bedFilter.frequency.setTargetAtTime(140 + 500 * agitation, now, 0.05)
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
    // Turn the sound on or off. Call from a click or touch handler the first time.
    set (on) {
      enabled = !!on
      if (enabled) start(); else stop()
    },
    get enabled () { return enabled },
    get stats () { return { ...stats, state: context ? context.state : 'off' } }
  }
}
