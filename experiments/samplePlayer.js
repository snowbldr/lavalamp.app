// Recorded sounds on the sound board (Robert: "can you see if you can find me some sounds we can
// use from the internet to start with? we can then like modify those sounds pitch and stretch
// them etc to fit the motion", then "make me a sound board with the sounds you find"). Each
// sample is an AudioBuffer with its own settings: a trim, a pitch in semitones, a stretch, a
// gain, and the event that fires it, with how much the event's size bends the pitch and the
// stretch. Stretch that does not change the pitch is granular: the sample is played as short
// overlapping grains, each at the pitch's rate, stepping through the sample slower or faster
// than they are laid down; at a stretch of 1 the sample plays straight.
export const SAMPLE_EVENTS = ['none', 'snap', 'lift', 'land', 'pour', 'spill', 'simmer']
export const DEFAULTS = { gain: 0.8, pitch: 0, stretch: 1, start: 0, end: 1, event: 'none', pitchBySize: -12, stretchBySize: 0, cooldown: 0.15 }
const GRAIN = 0.08 // seconds
const OVERLAP = 0.5 // of a grain

export function createSamplePlayer (getContext, getMaster) {
  const samples = [] // { name, source, license, buffer, settings, lastFired }

  function add (name, buffer, { source = '', license = '' } = {}, settings = {}) {
    const sample = { name, source, license, buffer, settings: { ...DEFAULTS, ...settings }, lastFired: -1 }
    samples.push(sample)
    return sample
  }

  // Play one sample. `size` 0 to 1 bends pitch and stretch by the sample's by-size amounts.
  function play (sample, { size = 0.5, strength = 1, pan = 0 } = {}) {
    const context = getContext()
    if (!context || context.state !== 'running' || !sample.buffer) return
    const s = sample.settings
    const semis = s.pitch + s.pitchBySize * (size - 0.5)
    const rate = Math.pow(2, semis / 12)
    const stretch = Math.max(0.1, s.stretch * Math.pow(2, s.stretchBySize * (size - 0.5)))
    const duration = sample.buffer.duration
    const from = Math.max(0, Math.min(duration, s.start * duration))
    const to = Math.max(from + 0.01, Math.min(duration, s.end * duration))
    const t0 = context.currentTime + 0.005
    const level = s.gain * strength
    let out = getMaster()
    if (context.createStereoPanner) { const p = context.createStereoPanner(); p.pan.value = Math.max(-0.8, Math.min(0.8, pan)); p.connect(out); out = p }
    if (Math.abs(stretch - 1) < 0.02) {
      const src = context.createBufferSource()
      src.buffer = sample.buffer
      src.playbackRate.value = rate
      const g = context.createGain()
      g.gain.value = level
      src.connect(g); g.connect(out)
      src.start(t0, from, (to - from))
      return
    }
    // Granular: grains GRAIN long at the pitch's rate, laid down every hopOut, reading the sample
    // every hopIn = hopOut / stretch, each under a triangle envelope so they cross fade.
    const hopOut = GRAIN * (1 - OVERLAP)
    const hopIn = hopOut / stretch
    const grains = Math.min(400, Math.ceil((to - from) / hopIn))
    for (let k = 0; k < grains; k++) {
      const at = from + k * hopIn
      if (at >= to) break
      const src = context.createBufferSource()
      src.buffer = sample.buffer
      src.playbackRate.value = rate
      const g = context.createGain()
      const start = t0 + k * hopOut
      g.gain.setValueAtTime(0, start)
      g.gain.linearRampToValueAtTime(level, start + GRAIN / 2)
      g.gain.linearRampToValueAtTime(0, start + GRAIN)
      src.connect(g); g.connect(out)
      src.start(start, at, Math.min(GRAIN * rate, to - at))
    }
  }

  // An event from the lava: every sample set to it fires, pitched and stretched by its size.
  function trigger (event) {
    for (const sample of samples) {
      if (sample.settings.event !== event.type) continue
      if (event.time - sample.lastFired < sample.settings.cooldown) continue
      sample.lastFired = event.time
      play(sample, { size: event.size, strength: 0.4 + 0.6 * (event.strength ?? 1), pan: event.x * 2 - 1 })
    }
  }

  return { samples, add, play, trigger }
}
