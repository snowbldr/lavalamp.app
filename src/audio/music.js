// The lamp listening to music (Robert: "one thing I would love is a music sync"). Nothing is
// sent anywhere: the browser's own microphone, or on a desktop a tab's audio, goes into a Web
// Audio AnalyserNode, and once a frame the lamp reads three band energies, a loudness and a
// beat from it. The numbers are 0 to 1 or so after Sensitivity, smoothed with a fast attack
// and a slow release so a hit lands at once and a quiet bar fades. The beat is bass energy
// against its own running average, with a refractory time so a kick counts once.
//
// Sources: 'mic' (getUserMedia, audio only, one permission prompt from a gesture; the phone
// over https works), 'tab' (getDisplayMedia with audio, Chrome on a desktop, a share dialog
// each time; the video track is stopped at once), and 'test' (a synthetic 120 bpm kick with
// a hi-hat, for checking the detector from a laptop with no music in the room). The test
// source goes to the analyser through a muted gain, so nothing is heard.
//
// Cost: one getByteFrequencyData a frame over 512 bins and a few sums. Measured on the GPU lamp
// at the defaults (see docs/decisions.md): well under a tenth of a millisecond a frame.
export const SOURCES = ['mic', 'tab']
const FFT = 1024 // 512 bins; at 48 kHz a bin is 47 Hz
const BASS_HZ = [40, 150]
const MID_HZ = [150, 2000]
const HIGH_HZ = [2000, 8000]
const ATTACK = 0.08 // seconds to rise
const RELEASE = 0.3 // seconds to fall
const BEAT_AVERAGE = 1.5 // seconds of bass history the beat is judged against
const BEAT_RATIO = 1.4 // bass this many times its average is a beat, at Sensitivity 1
const BEAT_FLOOR = 0.08 // bass under this (of full scale) is never a beat
const BEAT_REFRACTORY = 0.22 // seconds: faster than 270 bpm is not a beat

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
  const levels = { bass: 0, mid: 0, high: 0, level: 0, beat: false, bpm: 0, raw: { bass: 0, mid: 0, high: 0 } }
  let bassAverage = 0
  let lastBeat = -1
  let beatCount = 0
  const beatTimes = []
  let clock = 0

  const band = ([lo, hi]) => {
    const a = Math.max(1, Math.floor(lo / binHz))
    const b = Math.min(bins.length - 1, Math.ceil(hi / binHz))
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
        else if (which === 'tab') {
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
          for (const t of stream.getVideoTracks()) t.stop()
          if (!stream.getAudioTracks().length) throw new Error('no audio in the shared tab (tick "Share tab audio")')
          context.createMediaStreamSource(stream).connect(analyser)
        } else {
          stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false })
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
      levels.bass = levels.mid = levels.high = levels.level = 0
      levels.beat = false
    },
    // Once a frame: read the analyser and update `levels`. `sensitivity` scales the bands.
    update (dt, sensitivity = 1) {
      levels.beat = false
      if (!enabled || !analyser) return levels
      clock += dt
      analyser.getByteFrequencyData(bins)
      const raw = levels.raw
      raw.bass = band(BASS_HZ); raw.mid = band(MID_HZ); raw.high = band(HIGH_HZ)
      levels.bass = ease(levels.bass, Math.min(1.5, raw.bass * sensitivity), dt)
      levels.mid = ease(levels.mid, Math.min(1.5, raw.mid * sensitivity), dt)
      levels.high = ease(levels.high, Math.min(1.5, raw.high * sensitivity), dt)
      levels.level = ease(levels.level, Math.min(1.5, (raw.bass + raw.mid + raw.high) / 3 * sensitivity), dt)
      // The beat: the instant bass against its running average, which follows slowly.
      bassAverage += (raw.bass - bassAverage) * Math.min(1, dt / BEAT_AVERAGE)
      const ratio = BEAT_RATIO / Math.max(0.3, Math.sqrt(sensitivity))
      if (raw.bass > BEAT_FLOOR && raw.bass > bassAverage * ratio && clock - lastBeat > BEAT_REFRACTORY) {
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
    get bassAverage () { return bassAverage }
  }
}
