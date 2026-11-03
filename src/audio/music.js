// The lamp listening to music (Robert: "one thing I would love is a music sync"). Nothing is
// sent anywhere: the browser's own microphone, or on a desktop a tab's audio, goes into a Web
// Audio AnalyserNode, and once a frame the lamp reads three band energies, a loudness and a
// beat from it. The numbers are 0 to 1 or so after Sensitivity, smoothed with a fast attack
// and a slow release so a hit lands at once and a quiet bar fades. The beat is bass energy
// against its own running average, with a refractory time so a kick counts once.
//
// Sources: 'mic' (getUserMedia, audio only, one permission prompt from a gesture; the phone
// over https works; any audio input can be chosen, so a loopback driver such as BlackHole
// hears every app on the machine), 'system' (getDisplayMedia asking for system audio, a desktop
// browser, a share dialog each time; the picture is stopped the moment it arrives and only the
// audio is used: Robert, "we do not record any visuals from the screen or connect to any
// devices like webcam and only use the audio stream from the screen share"), and 'test' (a
// synthetic 120 bpm kick with a hi-hat, for checking the detector from a laptop with no music in
// the room; it reaches the analyser through a muted gain, so nothing is heard).
//
// Each sync reads its own frequency range, set by knobs (Robert: "we'll need to have like
// frequency range sliders for selecting a min and max for each type of sync we have so it can
// be dialed in for certain songs"): the beat, the heat, the eddies and the kick.
//
// Cost: one getByteFrequencyData a frame over 512 bins and a few sums. Measured on the GPU lamp
// at the defaults (see docs/decisions.md): well under a tenth of a millisecond a frame.
export const SOURCES = ['mic', 'system']
const FFT = 1024 // 512 bins; at 48 kHz a bin is 47 Hz
const ATTACK = 0.08 // seconds to rise
const RELEASE = 0.3 // seconds to fall
const BEAT_AVERAGE = 1.5 // seconds of bass history the beat is judged against
const BEAT_RATIO = 1.4 // bass this many times its average is a beat, at Sensitivity 1
const BEAT_FLOOR = 0.08 // bass under this (of full scale) is never a beat
const BEAT_REFRACTORY = 0.22 // seconds: faster than 270 bpm is not a beat
const PUNCH_AVERAGE = 2 // seconds of history each sync's punch is judged against

export function createMusic () {
  let context = null
  let analyser = null
  let stream = null // the mic or tab stream, to stop
  let testNodes = null
  let bins = null
  let source = 'mic'
  let enabled = false
  let error = ''
  let binHz = 0
  const levels = { heat: 0, eddy: 0, kick: 0, level: 0, beat: false, hat: false, bpm: 0, raw: { beat: 0, heat: 0, eddy: 0, kick: 0 } }
  let hatAverage = 0
  let lastHat = -1
  let device = '' // the chosen audio input's deviceId, '' for the default
  let bassAverage = 0
  const averages = { heat: 0, eddy: 0, kick: 0 }
  let lastBeat = -1
  let beatCount = 0
  const beatTimes = []
  let clock = 0

  const band = ([lo, hi]) => {
    if (hi < lo) [lo, hi] = [hi, lo]
    const a = Math.min(bins.length - 1, Math.max(1, Math.floor(lo / binHz)))
    const b = Math.max(a, Math.min(bins.length - 1, Math.ceil(hi / binHz)))
    let sum = 0
    for (let k = a; k <= b; k++) sum += bins[k]
    return sum / ((b - a + 1) * 255)
  }
  const ease = (from, to, dt) => from + (to - from) * Math.min(1, dt / (to > from ? ATTACK : RELEASE))

  async function open () {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) throw new Error('no Web Audio')
    if (!context) context = new Ctx()
    if (context.state !== 'running') await context.resume()
    analyser = analyser || context.createAnalyser()
    analyser.fftSize = FFT
    analyser.smoothingTimeConstant = 0.2
    bins = new Uint8Array(analyser.frequencyBinCount)
    binHz = context.sampleRate / FFT
  }

  function closeSource () {
    if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null }
    if (testNodes) { for (const n of testNodes) { try { if (n.stop) n.stop() } catch (e) {} try { n.disconnect() } catch (e) {} } testNodes = null }
  }

  // A kick at 120 bpm (a 55 Hz sine with a fast decay) and a hat every half beat, for the lab.
  function startTest () {
    const gain = context.createGain()
    gain.gain.value = 0 // heard by the analyser, not the room
    const kickOsc = context.createOscillator()
    kickOsc.type = 'sine'
    kickOsc.frequency.value = 55
    const kickEnv = context.createGain()
    kickEnv.gain.value = 0
    const noise = context.createBufferSource()
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    noise.buffer = buffer
    noise.loop = true
    const hatFilter = context.createBiquadFilter()
    hatFilter.type = 'highpass'
    hatFilter.frequency.value = 5000
    const hatEnv = context.createGain()
    hatEnv.gain.value = 0
    kickOsc.connect(kickEnv).connect(analyser)
    noise.connect(hatFilter).connect(hatEnv).connect(analyser)
    analyser.connect(gain).connect(context.destination)
    const t0 = context.currentTime + 0.05
    const beat = 0.5 // seconds at 120 bpm
    for (let k = 0; k < 600; k++) {
      const t = t0 + k * beat
      kickEnv.gain.setValueAtTime(1, t)
      kickEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
      hatEnv.gain.setValueAtTime(0.4, t)
      hatEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
      hatEnv.gain.setValueAtTime(0.25, t + beat / 2)
      hatEnv.gain.exponentialRampToValueAtTime(0.001, t + beat / 2 + 0.04)
    }
    kickOsc.start()
    noise.start()
    testNodes = [kickOsc, noise, kickEnv, hatEnv, hatFilter, gain]
  }

  return {
    levels,
    get enabled () { return enabled },
    get source () { return source },
    get error () { return error },
    // Start listening from `which` ('mic', 'tab' or 'test'). Call from a user gesture.
    async start (which = source) {
      error = ''
      try {
        await open()
        closeSource()
        source = which
        if (which === 'test') startTest()
        else if (which === 'system') {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error('this browser cannot share its audio; use Mic')
          // The browser only offers audio with a screen share, so a share is asked for; the
          // picture is stopped at once and never drawn, kept or sent.
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, systemAudio: 'include', selfBrowserSurface: 'exclude', surfaceSwitching: 'include' })
          for (const t of stream.getVideoTracks()) { t.stop(); stream.removeTrack(t) }
          if (!stream.getAudioTracks().length) throw new Error('no audio was shared: tick "Share system audio" (or "Share tab audio") in the dialog')
          context.createMediaStreamSource(stream).connect(analyser)
        } else {
          const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          if (device) audio.deviceId = { exact: device }
          stream = await navigator.mediaDevices.getUserMedia({ audio, video: false })
          context.createMediaStreamSource(stream).connect(analyser)
        }
        enabled = true
        bassAverage = 0; lastBeat = -1; beatCount = 0; beatTimes.length = 0
      } catch (e) {
        enabled = false
        error = e && e.message ? e.message : String(e)
        closeSource()
        throw e
      }
    },
    stop () {
      enabled = false
      closeSource()
      levels.heat = levels.eddy = levels.kick = levels.level = 0
      levels.beat = false
    },
    // Once a frame: read the analyser and update `levels`. `ranges` gives each sync its band in
    // Hz ({ beat, heat, eddy, kick }, each [lo, hi]); `sensitivity` scales them.
    update (dt, sensitivity = 1, ranges) {
      levels.beat = false
      levels.hat = false
      if (!enabled || !analyser) return levels
      clock += dt
      analyser.getByteFrequencyData(bins)
      const raw = levels.raw
      raw.beat = band(ranges.beat); raw.heat = band(ranges.heat); raw.eddy = band(ranges.eddy); raw.kick = band(ranges.kick)
      // Each sync follows its range's punch, how far it is above its own average over the last
      // PUNCH_AVERAGE seconds, not its loudness: a song's bass sits near 0.8 of full scale the
      // whole way through, and driven by loudness the floor stayed at three times its heat.
      for (const k of ['heat', 'eddy', 'kick']) {
        averages[k] += (raw[k] - averages[k]) * Math.min(1, dt / PUNCH_AVERAGE)
        const punch = Math.max(0, raw[k] - averages[k]) / Math.max(0.05, averages[k])
        levels[k] = ease(levels[k], Math.min(1.5, punch * sensitivity), dt)
      }
      levels.level = ease(levels.level, Math.min(1.5, (raw.heat + raw.eddy + raw.kick) / 3 * sensitivity), dt)
      // A hat: the same test on the kick range, quicker (a hi-hat runs eighths and sixteenths).
      hatAverage += (raw.kick - hatAverage) * Math.min(1, dt / 0.6)
      if (raw.kick > 0.04 && raw.kick > hatAverage * (1.25 / Math.max(0.3, Math.sqrt(sensitivity))) && clock - lastHat > 0.11) { levels.hat = true; lastHat = clock }
      // The beat: the instant energy in the beat range against its running average.
      bassAverage += (raw.beat - bassAverage) * Math.min(1, dt / BEAT_AVERAGE)
      const ratio = BEAT_RATIO / Math.max(0.3, Math.sqrt(sensitivity))
      if (raw.beat > BEAT_FLOOR && raw.beat > bassAverage * ratio && clock - lastBeat > BEAT_REFRACTORY) {
        levels.beat = true
        lastBeat = clock
        beatCount++
        beatTimes.push(clock)
        if (beatTimes.length > 9) beatTimes.shift()
        if (beatTimes.length >= 4) levels.bpm = Math.round(60 * (beatTimes.length - 1) / (beatTimes[beatTimes.length - 1] - beatTimes[0]))
      }
      return levels
    },
    get beats () { return beatCount },
    // The analyser's last frame of bins (0 to 255) and Hz a bin, for the spectrum view.
    spectrum () { return bins && enabled ? { bins, binHz } : null },
    // The audio inputs this browser can choose between; their names are only given once a
    // microphone permission has been granted, so the list is asked for again after listening.
    async inputs () {
      try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput').map(d => ({ id: d.deviceId, label: d.label || 'Input' })) } catch (e) { return [] }
    },
    get device () { return device },
    set device (id) { device = id || '' },
    get bassAverage () { return bassAverage }
  }
}
