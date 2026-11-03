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
const FFT = 2048 // 1024 bins; at 48 kHz a bin is 23 Hz (at 47 the beat range, 40 to 150 Hz, was three bins)
const ATTACK = 0.08 // seconds to rise
const RELEASE = 0.3 // seconds to fall
const BEAT_AVERAGE = 1.5 // seconds of bass history the beat is judged against
const BEAT_FLOOR = 0.08 // bass under this (of full scale) is never a beat
const BEAT_REFRACTORY = 0.22 // seconds: faster than 270 bpm is not a beat
const BEAT_PEAK_MEMORY = 10 // seconds the loudest recent bass is held over; a beat is within 12 dB of it
// The beat is read in power, not decibels (Robert, on real music: "I think it's reacting to notes
// that are too soft and too high frequency"): in decibels a soft note in a quiet bar rose as far
// as a kick in a loud one. A beat is the beat range's power rising over BEAT_RISE_FRAMES frames by
// BEAT_POWER_RISE times its own average, and by more, for its average, than the mids' rise
// (BEAT_MIDS, 300 Hz to 4 kHz) for theirs: a snare, a piano or a voice lifts the bass bins too,
// but lifts the mids more; a kick is the other way round.
const BEAT_POWER_RISE = 1.5
const BEAT_RISE_FRAMES = 4
const BEAT_MIDS = [300, 4000]
const BEAT_BASS_LEAD = 1
// The surge: the whole spectrum's power over the last SURGE_FAST seconds against the last
// SURGE_SLOW, so a drop that arrives as everything coming in at once (Robert, on Tom Vek's C-C:
// "at 0:54-0:55 or so, there's a big bass drop and then highly active music"), with no gap in the
// kick before it, still reads as one.
const SURGE_FAST = 0.4
const SURGE_SLOW = 6
// The song's sections, by level (Robert's C-C, scanned offline with docs/methods/tools/song-scan.js:
// the intro -52 rising to -40 dB, the drop at 0:55 -45 to -36, the busy part -33 to -38, after
// 1:51 -37 to -40 with the spectrum half as broad). Measured against the song itself the intro
// was the loudest thing heard yet and read as busy; against a reference it is plainly quiet. The
// reference is the loudest the song has been (2 s power), held and falling REFERENCE_FALL dB a
// second, never under REFERENCE_DB (lower by Sense, for a quiet microphone). Level alone left
// 1:51 busy (2 to 4 dB under), so the score adds the spectrum's breadth (the mean byte) against
// its own held peak, in dB, BREADTH_WEIGHT times, eased over SCORE_SMOOTH: busy above -BUSY_DB,
// calm under -CALM_DB, and in between it stays as it was. On C-C: calm to 0:55, busy from the
// drop, calm 1:52, busy 2:11 to 2:18 and from 2:23, calm 3:20 to 3:29. A drop: while calm, a
// surge past DROP_SURGE that lands within DROP_DB of the reference; the section turns busy at once.
const REFERENCE_DB = -36
const REFERENCE_FALL = 1 / 15
const BREADTH_FALL = 1 / 60 // of itself a second, the held peak of the breadth
const BREADTH_WEIGHT = 1.5
const SCORE_SMOOTH = 2
const BUSY_DB = 3
const CALM_DB = 6
const DROP_SURGE = 2
const DROP_DB = 4
const DROP_HOLD = 8 // seconds a drop holds the section busy while the score catches up
// A drop is also the bass coming back after a cut, busy or not (Robert, on Nate Band's Drugs I
// Like: "it didn't fire when the drop hit. drop is at :43-:44"). Scanned: that song reads busy
// from 0:03, so the drop out of a calm part never came; a build to 41.6 s, then the bass (20 to
// 150 Hz) cut to silence, 47 dB under the build, to 43.4 s, then the drop. The kick was gone
// 1.93 s, and the old first-kick-back rule wanted 2. C-C has the same cut, 53.7 to 54.9 s. And
// Skrillex's Bangarang (Robert: "it's doing really bad with skrillex bangarang, which is ironic
// because basically dubstep invented the drop"): its second drop, 2:46.97, comes after a gap of
// only 0.65 s in which the bass flickers back for a frame or two, so a cut counted as unbroken
// never reached its length. A beat is a drop when the bass (20 to 150 Hz) was CUT_DB under the
// kicks' peak for CUT_SHARE of the CUT_TIME seconds before it (up to CUT_SKIP before it, the
// beat's own rise), and the frame is within CUT_LEVEL dB of the reference: the bass of a
// breakdown coming back quiet (Bangarang's at 2:21 and 2:29, 9 dB under) is not a drop.
const CUT_DB = 20
const CUT_TIME = 0.5
const CUT_SHARE = 0.85 // 0.75 let the Bangarang intro's hits at 0:06 and 0:08 through
const CUT_SKIP = 0.07
const CUT_LEVEL = 6
// And something quieter or thinner came first: the section score (below) under CUT_BEFORE_SCORE
// at some point in the CUT_BEFORE seconds before the gap. In a full part dubstep's half-time bars
// leave gaps in the bass all through (Bangarang 1:20, 1:55; Drugs I Like 1:39), with the score
// at -0.5 to -3.2; before the real drops it dipped to -4.1 to -6 (and -53 out of the intro).
const CUT_BEFORE = 8
const CUT_BEFORE_SCORE = -4
// The kick back: the first beat after KICK_GONE seconds with none, landing near the reference (the
// gap is itself the different thing before it; the score, eased over 2 s, dipped only to -1.7). Bangarang's drop at 0:27.3 (Robert: "big pot built but did
// not fire on big drop... that's the drop at :25-:26") has the kick gone 0:23 to 0:27 and the
// level down 3 or 4 dB, but no cut in the bass and no surge.
const KICK_GONE = 2.5 // 2 added drops in Drugs I Like's full parts (1:11, 2:49, 3:03)
const SETTLE = 6 // seconds from the start before a drop: the averages start from the silence before the music, and Drugs I Like's first second read as one
// The boom: a deep sub bass note (Robert, on C-C after the drop: "there's like this deep
// BWOONNNNNGGGG sound, and I would expect some lava bursts to be timed with those"). Scanned
// offline: after 0:55 a note at 23 to 70 Hz every 8 beats (3.45 s at 140 bpm), held 1.5 to
// 2.5 s, its onset jumping 8 dB or more in four frames out of a sub that sat 17 to 30 dB lower
// the half second before, often with the mids ducking. The kick lifts the sub as far but lands
// on a sub that is already sounding (inside a note, or the intro's bass line), so it is judged
// against the half second before, not against its average. A boom is the sub rising BOOM_RISE
// dB over BEAT_RISE_FRAMES frames, BOOM_OVER dB above its mean from BOOM_BEFORE to BOOM_GAP
// seconds before, within BOOM_PEAK dB of the loudest sub lately, at most every BOOM_REFRACTORY.
const BOOM_RANGE = [20, 60]
const BOOM_RISE = 8
const BOOM_OVER = 17
const BOOM_BEFORE = 0.6
const BOOM_GAP = 0.1
const BOOM_PEAK = 14
const BOOM_PEAK_FALL = 0.6 // dB a second
const BOOM_REFRACTORY = 1
const SECTION_SMOOTH = 2 // seconds the section's power is eased over
const PUNCH_AVERAGE = 2 // seconds of history each sync's punch is judged against
// The beat clock: the lamp has to move before the beat to land on it (a pot takes a while to
// lift a blob, an eddy half a second to spin up), and live audio cannot be heard early, so the
// next beat is predicted from the ones heard (Robert: "it would be better to like preheat for a
// bass hit so that blobs and eddies and such would launch exactly at the base hit or drop").
// The period is the median gap between heard beats folded into 60 to 180 bpm, the phase pulled
// a third of the way toward each heard beat near a predicted one; locked once four in a row land
// within a fifth of a period, and it coasts through a missing kick for eight beats.
const CLOCK_PULL = 0.33 // share of a heard beat's error the phase takes
const CLOCK_WINDOW = 0.2 // of a period: a heard beat this close counts as on the clock
const CLOCK_LOCK = 4 // on-clock beats in a row to lock
const CLOCK_COAST = 64 // predicted beats without a heard one before the lock is dropped: a breakdown
// is coasted through on the clock (at 8 the lock went 4 s into the test's breakdown and the
// drop's first two seconds were late), so the drop can be met on time
const CLOCK_HEARING = 2 // missed beats after which the kick counts as gone (a breakdown)
// The activity: how much is going on in the song now against the rest of it, 0 in a breakdown
// to 1 in the fullest chorus (Robert: "parts that are in between drops should show less
// activity and high energy sections with all the instruments and such should show more").
// Three features, each smoothed over a few seconds and scaled between the lowest and highest
// it has been over the last ACTIVITY_MEMORY seconds: loudness, fullness (the share of 24 bands
// from 40 Hz to 12 kHz that are sounding) and the onsets a second (beats and hats).
const ACTIVITY_SMOOTH = 1.5 // seconds each feature is eased over
const ACTIVITY_MEMORY = 120 // seconds the lowest and highest are held over (45 crept so far through an 8 s breakdown that it read 0.8)
const ACTIVITY_RISE = 1 // seconds the activity takes to rise
const ACTIVITY_FALL = 3 // and to fall
const ACTIVITY_BANDS = 24
const ACTIVITY_SPREAD = 0.375
const bandLevels = new Float32Array(ACTIVITY_BANDS)

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
  const levels = { heat: 0, eddy: 0, kick: 0, level: 0, beat: false, hat: false, boom: false, bpm: 0, activity: 0.5, sinceBeat: 0, surge: 1, calm: true, drop: false, powerDb: -90, reference: -36, parts: { loud: 0, full: 0, onsets: 0 }, raw: { beat: 0, heat: 0, eddy: 0, kick: 0 } }
  // The clock, in this module's own seconds: the next predicted beat's time and number.
  const beatClock = { locked: false, period: 0.5, next: 0, index: 0, onClock: 0, missed: 0, tick: false, hit: false, heardAt: -1, sectionAt: 0 }
  const gaps = []
  const fits = [] // [beat number, time] of the on-clock beats, for the period
  // The activity's features: eased value, lowest and highest held, and the onsets heard.
  const features = { loud: { v: 0, lo: 0, hi: 0, seen: false }, full: { v: 0, lo: 0, hi: 0, seen: false }, onsets: { v: 0, lo: 0, hi: 0, seen: false } }
  const onsetTimes = []
  let hatAverage = 0
  let lastHat = -1
  let device = '' // the chosen audio input's deviceId, '' for the default
  let bassAverage = 0
  let beatPeak = 0
  let surgeFast = 0
  let surgeSlow = 0
  let sectionPower = 0
  let peakDb = -90
  let breadth = 0
  let breadthPeak = 0.05
  let score = null
  let droppedAt = -1e9
  let bassPowerAverage = 0
  let midsPowerAverage = 0
  const bassHistory = new Array(BEAT_RISE_FRAMES).fill(0)
  const midsHistory = new Array(BEAT_RISE_FRAMES).fill(0)
  const averages = { heat: 0, eddy: 0, kick: 0 }
  let lastBeat = -1
  let lastBoom = -1e9
  const scoreHistory = [] // [time, score] ten times a second over the last CUT_BEFORE seconds
  const lowHistory = [] // [time, whether the bass was under the cut] over the last CUT_TIME and CUT_SKIP
  let boomPeak = -90
  const subHistory = [] // [time, dB] of the sub over the last BOOM_BEFORE seconds
  let beatCount = 0
  const beatTimes = []
  let clock = 0
  let startedAt = 0
  let fileStartedAt = -1 // the audio clock when a file began, for its position
  let fileStream = null // the playing file's sound as a MediaStream, for recording
  let onFileEnd = null // called when a playing file reaches its end

  const band = ([lo, hi]) => {
    if (hi < lo) [lo, hi] = [hi, lo]
    const a = Math.min(bins.length - 1, Math.max(1, Math.floor(lo / binHz)))
    const b = Math.max(a, Math.min(bins.length - 1, Math.ceil(hi / binHz)))
    let sum = 0
    for (let k = a; k <= b; k++) sum += bins[k]
    return sum / ((b - a + 1) * 255)
  }
  // A range's mean power, from the analyser's bytes (decibels, -90 to -10 dB across 0 to 255),
  // 1 at full scale.
  const power = ([lo, hi]) => {
    if (hi < lo) [lo, hi] = [hi, lo]
    const a = Math.min(bins.length - 1, Math.max(1, Math.floor(lo / binHz)))
    const b = Math.max(a, Math.min(bins.length - 1, Math.ceil(hi / binHz)))
    let sum = 0
    for (let k = a; k <= b; k++) sum += Math.pow(10, (bins[k] - 255) * 8 / 255)
    return sum / (b - a + 1)
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
    // Headroom: the browser maps -100 to -30 dB onto the bytes, and louder clips at 255. The
    // test's bass sat at 0.98 to 1.0 of full scale every frame, so a kick had nothing to rise
    // into; a loud song through a loopback input does the same. -90 to -10 dB leaves room.
    analyser.minDecibels = -90
    analyser.maxDecibels = -10
    bins = new Uint8Array(analyser.frequencyBinCount)
    binHz = context.sampleRate / FFT
  }

  function closeSource () {
    if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null }
    if (testNodes) { for (const n of testNodes) { try { if (n.stop) n.stop() } catch (e) {} try { n.disconnect() } catch (e) {} } testNodes = null }
  }

  // A kick at 120 bpm (a 55 Hz sine with a fast decay) and a hat every half beat, for the lab, in
  // sections of 16 beats: full (kick, hats, a bass line and a wash of mids) then a breakdown
  // (soft hats and the wash low, no kick), so the activity and the clock's coasting can be seen.
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
    const bass = context.createOscillator()
    bass.type = 'sawtooth'
    bass.frequency.value = 110
    const bassFilter = context.createBiquadFilter()
    bassFilter.type = 'lowpass'
    bassFilter.frequency.value = 600
    const bassEnv = context.createGain()
    bassEnv.gain.value = 0
    const wash = context.createBiquadFilter()
    wash.type = 'bandpass'
    wash.frequency.value = 1500
    wash.Q.value = 0.4
    const washEnv = context.createGain()
    washEnv.gain.value = 0
    kickOsc.connect(kickEnv).connect(analyser)
    noise.connect(hatFilter).connect(hatEnv).connect(analyser)
    bass.connect(bassFilter).connect(bassEnv).connect(analyser)
    noise.connect(wash).connect(washEnv).connect(analyser)
    analyser.connect(gain).connect(context.destination)
    const t0 = context.currentTime + 0.05
    const beat = 0.5 // seconds at 120 bpm
    for (let k = 0; k < 600; k++) {
      const t = t0 + k * beat
      const full = Math.floor(k / 16) % 2 === 0
      if (k % 16 === 0) {
        bassEnv.gain.setValueAtTime(full ? 0.5 : 0, t)
        washEnv.gain.setValueAtTime(full ? 1.2 : 0.25, t)
      }
      const hat = full ? 1 : 0.4
      if (full) {
        kickEnv.gain.setValueAtTime(1, t)
        kickEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
      }
      hatEnv.gain.setValueAtTime(0.4 * hat, t)
      hatEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
      hatEnv.gain.setValueAtTime(0.25 * hat, t + beat / 2)
      hatEnv.gain.exponentialRampToValueAtTime(0.001, t + beat / 2 + 0.04)
    }
    kickOsc.start()
    noise.start()
    bass.start()
    testNodes = [kickOsc, noise, bass, kickEnv, hatEnv, hatFilter, bassFilter, bassEnv, wash, washEnv, gain]
  }

  // A heard beat. Not locked: it starts the clock again from itself and its gap to the last
  // goes into the period. Locked: one near a predicted beat pulls the phase and its gap feeds
  // the period; one off the clock is ignored, since a breakdown's stray hits dragged a locked
  // 0.5 s period to 0.57 and the phase 0.2 s late.
  function hear (t) {
    const c = beatClock
    const previous = c.next - c.period
    const error = Math.abs(t - previous) < Math.abs(t - c.next) ? t - previous : t - c.next
    let onClock = c.heardAt >= 0 && Math.abs(error) < CLOCK_WINDOW * c.period
    // Back from a breakdown the first kick puts the phase right outright: coasting 16 beats on a
    // period 8 ms out left the drop 0.13 s off, outside the window, and a lock that ignores
    // off-clock beats then never heard the song again.
    const returning = c.locked && c.missed >= CLOCK_HEARING
    if (returning && !onClock) {
      const number = c.index + 1 + Math.round((t - c.next) / c.period)
      c.next = t + (c.index + 1 - number) * c.period
      c.sectionAt = number
      c.hit = true
      c.missed = 0
      c.heardAt = t
      fits.length = 0
      fits.push([number, t])
      return
    }
    if (c.locked && !onClock) return
    if (c.heardAt >= 0) {
      let gap = t - c.heardAt
      while (gap > 1) gap /= 2
      while (gap < 1 / 3) gap *= 2
      gaps.push(gap)
      if (gaps.length > 12) gaps.shift()
      if (gaps.length >= 3 && fits.length < 8) {
        const sorted = [...gaps].sort((a, b) => a - b)
        c.period += (sorted[sorted.length >> 1] - c.period) * 0.5
      }
    }
    c.heardAt = t
    if (onClock) {
      // The kick back after a breakdown, or the lock's first beat: the phrase counts from here.
      const number = Math.abs(t - previous) < Math.abs(t - c.next) ? c.index : c.index + 1
      if (c.missed >= CLOCK_HEARING) c.sectionAt = number
      // The period from a straight line through the on-clock beats by number: the median gap
      // was 8 ms out, which coasting through a breakdown turns into 0.13 s.
      fits.push([number, t])
      if (fits.length > 32) fits.shift()
      if (fits.length >= 8) {
        let sn = 0, st = 0, snn = 0, snt = 0
        for (const [n, x] of fits) { sn += n; st += x; snn += n * n; snt += n * x }
        const k = fits.length
        const slope = (k * snt - sn * st) / (k * snn - sn * sn)
        if (slope > 1 / 3 && slope < 1) c.period = slope
      }
      c.next += error * CLOCK_PULL
      c.onClock++
      c.hit = true
      if (c.onClock >= CLOCK_LOCK) c.locked = true
    } else {
      // A new run of beats, numbered from here: the phrase counts from its first beat, not the
      // fourth where the lock comes (counted from the lock, the test's drop missed its pot).
      c.onClock = 0
      c.next = t + c.period
      c.sectionAt = c.index
      fits.length = 0
      fits.push([c.index, t])
    }
  }
  // The predicted beats passing: a tick on the frame one falls in; a predicted beat with no
  // on-clock beat heard since the last is a miss, and CLOCK_COAST misses drop the lock.
  function tickClock () {
    const c = beatClock
    c.tick = false
    if (c.heardAt < 0) return
    while (clock >= c.next + c.period * CLOCK_WINDOW) {
      c.next += c.period
      c.index++
      c.tick = c.locked
      if (c.hit) c.missed = 0; else c.missed++
      c.hit = false
      if (c.missed > CLOCK_COAST) { c.locked = false; c.onClock = 0 }
    }
  }
  // The activity, once a frame, from the bins already read.
  function activity (dt) {
    let loud = 0
    for (let k = 1; k < bins.length; k++) loud += bins[k]
    loud /= (bins.length - 1) * 255
    // A band is sounding within ACTIVITY_SPREAD of the loudest (the bytes are decibels, 80 dB
    // across, so 0.375 is 30 dB): a fixed floor read every band as sounding all song long.
    let loudest = 0
    for (let i = 0; i < ACTIVITY_BANDS; i++) {
      bandLevels[i] = band([40 * Math.pow(300, i / ACTIVITY_BANDS), 40 * Math.pow(300, (i + 1) / ACTIVITY_BANDS)])
      if (bandLevels[i] > loudest) loudest = bandLevels[i]
    }
    let sounding = 0
    for (let i = 0; i < ACTIVITY_BANDS; i++) if (bandLevels[i] > 0.1 && bandLevels[i] > loudest - ACTIVITY_SPREAD) sounding++
    while (onsetTimes.length && clock - onsetTimes[0] > 4) onsetTimes.shift()
    const values = { loud, full: sounding / ACTIVITY_BANDS, onsets: onsetTimes.length / 4 }
    let sum = 0
    if (clock - startedAt < 1) return // the first second is the silence before the music
    for (const [k, f] of Object.entries(features)) {
      const x = values[k]
      if (!f.seen) { f.v = x; f.lo = x; f.hi = x; f.seen = true }
      f.v += (x - f.v) * Math.min(1, dt / ACTIVITY_SMOOTH)
      // The held range creeps back toward now over the memory, so a song's quiet intro does
      // not make every later bar read as full.
      f.hi = Math.max(f.v, f.hi - (f.hi - f.v) * Math.min(1, dt / ACTIVITY_MEMORY))
      f.lo = Math.min(f.v, f.lo + (f.v - f.lo) * Math.min(1, dt / ACTIVITY_MEMORY))
      const span = f.hi - f.lo
      levels.parts[k] = span > 0.02 * Math.max(0.05, f.hi) ? (f.v - f.lo) / span : 0.5
      sum += levels.parts[k]
    }
    const target = sum / 3
    levels.relative = target // the old activity, against the song so far: kept for the log, not used (the intro read as busy)
  }

  return {
    levels,
    get enabled () { return enabled },
    get source () { return source },
    get error () { return error },
    // Start listening from `which` ('mic', 'system', 'test' or 'file'). Call from a user gesture.
    // A file is { data: an ArrayBuffer of an audio file, audible: whether it is heard too }: the
    // page plays it, so the lamp hears it exactly, from the top (Robert's test song, C-C).
    async start (which = source, file) {
      error = ''
      try {
        await open()
        closeSource()
        source = which
        if (which === 'test') startTest()
        else if (which === 'file') {
          const buffer = await context.decodeAudioData(file.data.slice(0))
          const play = context.createBufferSource()
          play.buffer = buffer
          play.connect(analyser)
          const out = context.createGain()
          out.gain.value = file.audible ? 1 : 0
          analyser.connect(out).connect(context.destination)
          // The song's own sound, for recording the lamp with it (app.js, Record): exact, with
          // no screen share and no loopback.
          const record = context.createMediaStreamDestination()
          play.connect(record)
          fileStream = record.stream
          play.onended = () => { if (testNodes && testNodes[0] === play && onFileEnd) onFileEnd() }
          play.start()
          fileStartedAt = context.currentTime
          testNodes = [play, out, record]
        } else if (which === 'system') {
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
        bassAverage = 0; beatPeak = 0; surgeFast = surgeSlow = sectionPower = 0; peakDb = -90; breadth = 0; breadthPeak = 0.05; score = null; levels.calm = true; levels.drop = false; bassPowerAverage = midsPowerAverage = 0; bassHistory.fill(0); midsHistory.fill(0); lastBeat = -1; beatCount = 0; beatTimes.length = 0; lastBoom = -1e9; boomPeak = -90; subHistory.length = 0; lowHistory.length = 0; scoreHistory.length = 0
        Object.assign(beatClock, { locked: false, period: 0.5, next: 0, index: 0, onClock: 0, missed: 0, tick: false, hit: false, heardAt: -1, sectionAt: 0 }); gaps.length = 0; fits.length = 0
        for (const f of Object.values(features)) f.seen = false
        onsetTimes.length = 0; levels.activity = 0.5; levels.sinceBeat = 0; startedAt = clock
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
    update (dt, sensitivity = 1, ranges, frame) {
      levels.beat = false
      levels.hat = false
      levels.boom = false
      if (frame) {
        // A frame given rather than read (docs/methods/tools/song-scan.js runs a whole song
        // through this offline, faster than it plays): its bytes and Hz a bin.
        if (!bins || bins.length !== frame.bins.length) bins = new Uint8Array(frame.bins.length)
        bins.set(frame.bins)
        binHz = frame.binHz
        if (!enabled) { enabled = true; startedAt = clock }
      } else {
        if (!enabled || !analyser) return levels
        analyser.getByteFrequencyData(bins)
      }
      clock += dt
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
      if (raw.kick > 0.04 && raw.kick > hatAverage * (1.25 / Math.max(0.3, Math.sqrt(sensitivity))) && clock - lastHat > 0.11) { levels.hat = true; lastHat = clock; onsetTimes.push(clock) }
      // The beat, in power (see BEAT_POWER_RISE): the rise over the last few frames against the
      // range's own average, so a held note counts for nothing and only a hit's attack does (by
      // energy against its average a bass line hid half the test's kicks), and against the mids'.
      bassAverage += (raw.beat - bassAverage) * Math.min(1, dt / BEAT_AVERAGE)
      const bassPower = power(ranges.beat)
      const midsPower = power(BEAT_MIDS)
      const bassRise = Math.max(0, bassPower - Math.min(...bassHistory)) / Math.max(1e-9, bassPowerAverage)
      const midsRise = Math.max(0, midsPower - Math.min(...midsHistory)) / Math.max(1e-9, midsPowerAverage)
      bassHistory.shift(); bassHistory.push(bassPower)
      midsHistory.shift(); midsHistory.push(midsPower)
      bassPowerAverage += (bassPower - bassPowerAverage) * Math.min(1, dt / BEAT_AVERAGE)
      midsPowerAverage += (midsPower - midsPowerAverage) * Math.min(1, dt / BEAT_AVERAGE)
      raw.rise = bassRise
      raw.midsRise = midsRise
      // Near the recent kicks too, within 12 dB (a sixteenth of their power), so in a breakdown
      // the leak of hats and pads into the bass does not count.
      beatPeak = Math.max(bassPower, beatPeak - (beatPeak - bassPower) * Math.min(1, dt / BEAT_PEAK_MEMORY))
      // The cut (see CUT_DB): the bass and the sub together, against the kicks' held peak.
      const lowPower = power([20, ranges.beat[1]])
      let low = 0
      let lowCounted = 0
      for (const [t, under] of lowHistory) if (clock - t >= CUT_SKIP) { lowCounted++; if (under) low++ }
      raw.cut = lowCounted ? low / lowCounted : 0
      const cutBefore = lowCounted > 0 && clock - lowHistory[0][0] >= CUT_TIME + CUT_SKIP - 0.05 && low >= CUT_SHARE * lowCounted
      lowHistory.push([clock, lowPower < beatPeak * Math.pow(10, -CUT_DB / 10)])
      while (lowHistory.length && clock - lowHistory[0][0] > CUT_TIME + CUT_SKIP) lowHistory.shift()
      if (raw.beat > BEAT_FLOOR && bassPower > beatPeak / 16 && bassRise > BEAT_POWER_RISE / Math.max(0.3, Math.sqrt(sensitivity)) && bassRise > midsRise * BEAT_BASS_LEAD && clock - lastBeat > BEAT_REFRACTORY) {
        levels.beat = true
        lastBeat = clock
        beatCount++
        beatTimes.push(clock)
        if (beatTimes.length > 9) beatTimes.shift()
        if (beatTimes.length >= 4) levels.bpm = Math.round(60 * (beatTimes.length - 1) / (beatTimes[beatTimes.length - 1] - beatTimes[0]))
        onsetTimes.push(clock)
        hear(clock)
      }
      const kickGoneFor = levels.sinceBeat // seconds without a beat before this frame
      levels.sinceBeat = levels.beat ? 0 : levels.sinceBeat + dt
      // The boom (see BOOM_RISE), in the analyser's decibels: a byte is 80/255 dB.
      const subDb = -90 + band(BOOM_RANGE) * 80
      const rising = subHistory.slice(-BEAT_RISE_FRAMES)
      let before = 0
      let counted = 0
      for (const [t, v] of subHistory) if (clock - t >= BOOM_GAP) { before += v; counted++ }
      boomPeak = Math.max(subDb, boomPeak - BOOM_PEAK_FALL * dt)
      raw.boomRise = rising.length ? subDb - Math.min(...rising.map(r => r[1])) : 0
      raw.boomOver = counted ? subDb - before / counted : 0
      if (rising.length === BEAT_RISE_FRAMES && counted && raw.boomRise > BOOM_RISE && raw.boomOver > BOOM_OVER && subDb > boomPeak - BOOM_PEAK && clock - lastBoom > BOOM_REFRACTORY) {
        levels.boom = true
        lastBoom = clock
      }
      subHistory.push([clock, subDb])
      while (subHistory.length && clock - subHistory[0][0] > BOOM_BEFORE) subHistory.shift()
      const total = power([40, 12000])
      if (!surgeSlow) surgeFast = surgeSlow = total
      surgeFast += (total - surgeFast) * Math.min(1, dt / SURGE_FAST)
      surgeSlow += (total - surgeSlow) * Math.min(1, dt / SURGE_SLOW)
      levels.surge = surgeFast / Math.max(1e-9, surgeSlow)
      raw.total = total
      if (!sectionPower) sectionPower = total
      sectionPower += (total - sectionPower) * Math.min(1, dt / SECTION_SMOOTH)
      const db = 10 * Math.log10(Math.max(1e-12, sectionPower))
      const fastDb = 10 * Math.log10(Math.max(1e-12, surgeFast))
      peakDb = Math.max(db, peakDb - REFERENCE_FALL * dt)
      const reference = Math.max(peakDb, REFERENCE_DB - 10 * Math.log10(Math.max(0.2, sensitivity)))
      let byteSum = 0
      for (let k = 1; k < bins.length; k++) byteSum += bins[k]
      breadth += (byteSum / ((bins.length - 1) * 255) - breadth) * Math.min(1, dt)
      breadthPeak = Math.max(breadth, breadthPeak * (1 - BREADTH_FALL * dt))
      const now = db - reference + BREADTH_WEIGHT * 10 * Math.log10(Math.max(1e-3, breadth) / Math.max(0.05, breadthPeak))
      score = score === null ? now : score + (now - score) * Math.min(1, dt / SCORE_SMOOTH)
      levels.powerDb = db
      levels.reference = reference
      levels.score = score
      levels.drop = false
      if (!scoreHistory.length || clock - scoreHistory[scoreHistory.length - 1][0] >= 0.1) scoreHistory.push([clock, score])
      while (scoreHistory.length && clock - scoreHistory[0][0] > CUT_BEFORE) scoreHistory.shift()
      const dippedBefore = () => scoreHistory.some(([t, v]) => clock - t > CUT_TIME + CUT_SKIP && v < CUT_BEFORE_SCORE)
      if (clock - startedAt > SETTLE) {
        if (levels.beat && ((cutBefore && dippedBefore()) || kickGoneFor >= KICK_GONE) && 10 * Math.log10(Math.max(1e-12, total)) > reference - CUT_LEVEL) { levels.drop = true; levels.calm = false; droppedAt = clock }
        else if (levels.calm && levels.surge > DROP_SURGE && fastDb > reference - DROP_DB) { levels.drop = true; levels.calm = false; droppedAt = clock }
        else if (levels.calm && score > -BUSY_DB) levels.calm = false
        else if (!levels.calm && score < -CALM_DB && clock - droppedAt > DROP_HOLD) levels.calm = true
      }
      // The activity, for the knobs it scales: 0 at 12 dB under the reference to 1 at it.
      levels.activity = Math.max(0, Math.min(1, (db - reference + 12) / 12))
      tickClock()
      activity(dt)
      return levels
    },
    get beats () { return beatCount },
    get time () { return clock }, // seconds this module has been listening, all told
    get fileStream () { return source === 'file' ? fileStream : null },
    set onFileEnd (f) { onFileEnd = f },
    get filePosition () { return source === 'file' && context ? context.currentTime - fileStartedAt : -1 }, // seconds into a playing file
    // The beat clock: locked or not, whether the kick is being heard (not in a breakdown), the
    // period, seconds to the next predicted beat (number index + 1), the beat the current
    // section began on, and whether a predicted beat fell in this frame.
    get clock () { return { locked: beatClock.locked, hearing: beatClock.locked && beatClock.missed < CLOCK_HEARING, period: beatClock.period, until: beatClock.next - clock, index: beatClock.index, sectionAt: beatClock.sectionAt, tick: beatClock.tick } },
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
