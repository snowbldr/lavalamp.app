import { a, canvas, div, sub } from '@srfnstack/fntags'
import { createSimulation } from './sim/simulation.js'
import { createGpuLamp, getGpuDevice } from './sim/gpuSimulation.js'
import { createWorkerLamp } from './sim/workerLamp.js'
import { FLOW_SPACING, HEATER_CELL } from './render/overlays.js'
import { createRenderer } from './render/renderer.js'
import { createMotionInput } from './input/motion.js'
import { createPointerInput } from './input/pointer.js'
import { createGloop } from './audio/gloop.js'
import { createSpectrumView } from './render/spectrum.js'
import { createMusic } from './audio/music.js'
import { TURNS, lampSizeFor, lampToPage, pageToLamp, pageVectorToLamp } from './input/frame.js'
import { notify } from './ui/components.js'
import { takeUpgrade, v1SettingsBanner } from './versions.js'
import { createSettingsPanel } from './ui/settingsPanel.js'
import {
  bgColor,
  computeDefaultGravity,
  conduction,
  cupDepth,
  wobble,
  drifters,
  computeDefaultMaxTemp,
  computeDefaultParticleCount,
  computeDefaultInteractionRadius,
  computeDefaultParticleSize,
  computeDefaultSmooth,
  computeDefaultPull,
  computeDefaultStiffnessNear,
  defaultPull,
  defaultStiffnessNear,
  REST_DENSITY,
  computeDefaultBlend,
  defaultBlend,
  setBackend,
  computeDefaultConduction,
  computeDefaultTurbulence,
  computeDefaultDrifters,
  computeDefaultWobbleKick,
  computeDefaultViscosity,
  defaultTurbulence,
  defaultDrifters,
  defaultWobbleKick,
  defaultViscosity,
  defaultConduction,
  computeDefaultReserve,
  defaultReserve,
  reserve,
  lift,
  computeDefaultLift,
  defaultLift,
  computeDefaultWobbleMax,
  defaultWobbleMax,
  computeDefaultHeatSpots,
  defaultHeatSpots,
  computeDefaultElementHeat,
  defaultElementHeat,
  computeDefaultElementLife,
  defaultElementLife,
  computeDefaultElementRate,
  defaultElementRate,
  computeDefaultElementCore,
  defaultElementCore,
  pixels,
  autoPixels,
  targetFps,
  backendLabel,
  GPU_PARTICLES,
  GPU_REACH,
  defaultReach,
  defaultInteractionRadius,
  defaultParticleSize,
  defaultSmooth,
  wobbleKick,
  wobbleMax,
  reach,
  skin,
  wall,
  elementHeat,
  elementLife,
  elementRate,
  elementLifeScale,
  elementCore,
  floorHeat,
  floorGlow,
  defaultGravityStrength,
  defaultMaxTemp,
  defaultParticleCount,
  gravityStrength,
  heatSpots,
  heatCold,
  heatCool,
  heatHot,
  heatPeak,
  heatWarm,
  flowFast,
  flowSlow,
  interactionRadius,
  loadSavedSettings,
  applySettings,
  getSettings,
  saveSettings,
  maxTemp,
  pace,
  particleCount,
  particleSize,
  pull,
  showFlow,
  showCups,
  sound,
  soundPending,
  fullscreen,
  screenLabel,
  motionLabel,
  fpsLabel,
  soundBed,
  music,
  musicPending,
  musicSource,
  musicFileName,
  musicRecording,
  musicSensitivity,
  musicEvery,
  musicTempo,
  musicPulse,
  musicSpawn,
  musicSpin,
  musicLead,
  musicActivity,
  musicDrop,
  musicBoom,
  musicBusyEddies,
  musicFlip,
  musicWobble,
  musicVent,
  showSpectrum,
  musicBeatLo,
  musicBeatHi,
  musicHeatLo,
  musicHeatHi,
  musicEddyLo,
  musicEddyHi,
  musicKickLo,
  musicKickHi,
  musicFloor,
  musicLift,
  musicTurb,
  musicKick,
  showHeater,
  settle,
  smooth,
  blend,
  stiffnessNear,
  stir,
  touchMode,
  touchStrength,
  eddySpeed,
  eddyFalloff,
  eddyCurve,
  turbulence,
  viscosity,
  seed
} from './ui/settings.js'

// Fixed step. The sim does not track real frame time, and the tuning assumes it does not.
const FRAME = 1 / 60
// How hard a bump to the device shoves the lava.
const MOTION_GAIN = 2
// How much of a window's move the lava owes (1 is all of it), the most it can owe, and how fast
// the debt is paid.
const WINDOW_SHAKE_GAIN = 0.8
const WINDOW_SHAKE_MAX = 160 // px owed at most
const WINDOW_SHAKE_EASE = 0.12 // s over which a move is paid out
// How long gravity has to point at a new edge before the lamp turns to it, in seconds.
const TURN_DELAY = 0.6

// The lamp is the whole window (it used to stop at 1000 px each way to keep the per pixel metaball
// pass affordable; the performance work since made that unnecessary), turned in quarter turns so
// its floor is on whichever edge gravity points at.
const pageSize = () => [window.innerWidth, window.innerHeight]

// Copy a setting into a plain object now and whenever it changes. The sim and renderer read the
// plain objects, so neither of them knows about fntags.
const mirror = (state, target, key, convert = v => v) => {
  target[key] = convert(state())
  state.subscribe(value => { target[key] = convert(value) })
}

// A default that follows the window: update it, and if the setting was still sitting on the old
// default, move the setting along with it.
const followWindow = (defaultState, state, value) => {
  const wasDefault = state() === defaultState()
  defaultState(value)
  if (wasDefault) state(value)
}

// Move the backend- and window-following defaults to the given lamp size, carrying every setting
// that still sits on its old default along. Run once the backend is known and before any saved
// settings or share link load: the defaults are born with the CPU's values at module load, and
// a loaded value that happened to equal one of those was being carried to the GPU's default by
// the first fit (Robert's GPU link with Turb 150 and Eddies 6, the CPU defaults, came up as 45
// and 2 on 2026-11-01). Run again by fit on every resize.
const refitDefaults = (width, height) => {
  followWindow(defaultParticleCount, particleCount, computeDefaultParticleCount(width, height))
  followWindow(defaultMaxTemp, maxTemp, computeDefaultMaxTemp(height))
  followWindow(defaultConduction, conduction, computeDefaultConduction())
  followWindow(defaultTurbulence, turbulence, computeDefaultTurbulence())
  followWindow(defaultDrifters, drifters, computeDefaultDrifters())
  followWindow(defaultWobbleKick, wobbleKick, computeDefaultWobbleKick())
  followWindow(defaultViscosity, viscosity, computeDefaultViscosity())
  followWindow(defaultReserve, reserve, computeDefaultReserve())
  followWindow(defaultLift, lift, computeDefaultLift())
  followWindow(defaultWobbleMax, wobbleMax, computeDefaultWobbleMax())
  followWindow(defaultHeatSpots, heatSpots, computeDefaultHeatSpots())
  followWindow(defaultElementHeat, elementHeat, computeDefaultElementHeat())
  followWindow(defaultElementLife, elementLife, computeDefaultElementLife())
  followWindow(defaultElementRate, elementRate, computeDefaultElementRate())
  followWindow(defaultElementCore, elementCore, computeDefaultElementCore())
  followWindow(defaultGravityStrength, gravityStrength, computeDefaultGravity(height))
  followWindow(defaultInteractionRadius, interactionRadius, computeDefaultInteractionRadius(width, height))
  followWindow(defaultParticleSize, particleSize, computeDefaultParticleSize(width, height))
  followWindow(defaultSmooth, smooth, computeDefaultSmooth(width, height))
  followWindow(defaultPull, pull, computeDefaultPull(width, height))
  followWindow(defaultStiffnessNear, stiffnessNear, computeDefaultStiffnessNear(width, height))
  followWindow(defaultBlend, blend, computeDefaultBlend(width, height))
}

export async function start () {
  // The GPU backend when the browser has WebGPU and the URL does not say ?cpu; it carries ten
  // times the particles, so the window-following defaults move with it before anything is sized.
  const device = new URLSearchParams(window.location.search).has('cpu') ? null : await getGpuDevice().catch(() => null)
  if (device) { setBackend('gpu'); followWindow(defaultReach, reach, GPU_REACH) }
  refitDefaults(window.innerWidth, window.innerHeight)
  // Saved settings are per backend, so they load once the backend is known and the defaults sit on it.
  loadSavedSettings()
  // Arriving from an older version's banner: its settings, mapped (see versions.js), go on top
  // and are saved as this version's, so the next visit finds them.
  const upgrade = takeUpgrade()
  if (upgrade) { applySettings(upgrade.mapped); saveSettings() }
  // The GPU solver never moves a particle more than GPU_REACH a pass (see REACH_CAP in
  // gpuSimulation.js); a loaded Reach above it would be a lie on the knob.
  if (device && reach() > GPU_REACH) reach(GPU_REACH)

  const params = {}
  // ?damp=N tries another damping of a reversing relaxation move on the GPU (see relax in
  // gpuSimulation.js; 0.25 is the lamp's, 1 is off, 0 drops the move): a knob for finding out,
  // like ?profile, not a setting.
  const dampQuery = new URLSearchParams(window.location.search).get('damp')
  if (dampQuery !== null && !Number.isNaN(Number(dampQuery))) params.damp = Number(dampQuery)
  // ?wallNear=N&wallPull=M try the glass as boundary particles (see wallLattice in
  // gpuSimulation.js); 0 and 0, the lamp as it was.
  for (const key of ['wallNear', 'wallPull']) { const q = new URLSearchParams(window.location.search).get(key); if (q !== null && !Number.isNaN(Number(q))) params[key] = Number(q) }
  mirror(particleCount, params, 'particleCount', Math.trunc)
  mirror(touchStrength, params, 'touchStrength')
  mirror(eddySpeed, params, 'eddySpeed')
  mirror(eddyFalloff, params, 'eddyFalloff')
  mirror(eddyCurve, params, 'eddyCurve')
  mirror(interactionRadius, params, 'interactionRadius')
  params.restDensity = REST_DENSITY // Pull is Stiff times Density; see computeDefaultPull
  mirror(pull, params, 'stiffness', v => v / REST_DENSITY)
  mirror(stiffnessNear, params, 'stiffnessNear')
  mirror(maxTemp, params, 'maxTemp')
  mirror(gravityStrength, params, 'gravity')
  mirror(particleSize, params, 'particleSize')
  mirror(stir, params, 'stir')
  mirror(conduction, params, 'conduction')
  mirror(turbulence, params, 'turbulence')
  mirror(drifters, params, 'drifters')
  mirror(heatSpots, params, 'heatSpots')
  mirror(cupDepth, params, 'cupDepth')
  mirror(reserve, params, 'reserveCap')
  mirror(lift, params, 'liftCap')
  mirror(wobble, params, 'wobble')
  mirror(settle, params, 'settle')
  mirror(viscosity, params, 'viscosity')
  mirror(wobbleKick, params, 'wobbleKick')
  mirror(wobbleMax, params, 'wobbleMax')
  mirror(reach, params, 'reach')
  mirror(skin, params, 'kickBelow')
  mirror(wall, params, 'wallPush')
  mirror(elementHeat, params, 'elementHeat')
  mirror(elementLife, params, 'elementLife')
  mirror(elementRate, params, 'elementRate')
  mirror(elementLifeScale, params, 'elementLifeScale')
  mirror(elementCore, params, 'elementCore')
  mirror(floorHeat, params, 'floorHeat')
  mirror(floorGlow, params, 'floorGlow')
  // The floor area a settled particle takes up, for the spawn slab: about 14 px² at radius 20 (measured,
  // scaling with the radius squared; the old liquid's 400 px² at radius 60.
  mirror(interactionRadius, params, 'spawnArea', r => 14 * (r / 20) * (r / 20))
  // Finger heat per step, the lab's 48 (the lamp's old 12 was for Max heat 2000).
  params.touchHeat = 48

  const look = {}
  mirror(heatCold, look, 'heatCold')
  mirror(heatCool, look, 'heatCool')
  mirror(heatWarm, look, 'heatWarm')
  mirror(heatHot, look, 'heatHot')
  mirror(heatPeak, look, 'heatPeak')
  mirror(flowSlow, look, 'flowSlow')
  mirror(flowFast, look, 'flowFast')
  mirror(particleSize, look, 'particleSize')
  mirror(showFlow, look, 'showFlow')
  look.showHeat = true // the heat map is the lamp's only colouring now; the lab still draws its silhouette flat
  mirror(showHeater, look, 'showHeater')
  mirror(showCups, look, 'showCups')
  mirror(smooth, look, 'smooth')
  mirror(blend, look, 'blend')
  mirror(pixels, look, 'pixels')

  // The positions before the last step, by birth index, for the pace interpolation. By birth
  // index because the CPU step sorts its particles into cell order, so a slot holds a different
  // particle after the step; drawn slot against slot the lava flew between strangers whenever
  // the pool moved (holes and a ragged edge: "weird pulsing and artifacts").
  // Birth indices are never reused (a particle dropped on a shrink leaves a hole), so the arrays
  // are sized by the largest one and `stamp` says which remember() an entry belongs to.
  let previous = { x: new Float32Array(0), y: new Float32Array(0), stamp: new Int32Array(0), tick: 0 }
  const remember = () => {
    const { x, y, id } = sim.state
    const n = sim.count
    let top = n
    if (id) for (let k = 0; k < n; k++) if (id[k] >= top) top = id[k] + 1
    if (previous.x.length < top) previous = { x: new Float32Array(top * 2), y: new Float32Array(top * 2), stamp: new Int32Array(top * 2), tick: previous.tick }
    previous.tick++
    for (let k = 0; k < n; k++) { const b = id ? id[k] : k; previous.x[b] = x[k]; previous.y[b] = y[k]; previous.stamp[b] = previous.tick }
  }
  let edge = 'bottom' // the page edge the lamp's floor sits on
  let turns = TURNS[edge]
  let [pageWidth, pageHeight] = pageSize()
  let [width, height] = lampSizeFor(turns, pageWidth, pageHeight)
  const lamp = canvas({ id: 'lavalamp', style: { transition: 'transform 0.4s' } })
  if (device) params.capacity = GPU_PARTICLES
  // Without WebGPU the simulation runs on a worker thread (see sim/cpuWorker.js), so the drawing
  // keeps the display's rate however long a step takes; ?mainthread keeps it on the page's thread.
  const remote = !device && typeof Worker === 'function' && !new URLSearchParams(window.location.search).has('mainthread')
  const overlayWants = () => ({ flow: showFlow() ? FLOW_SPACING : 0, heater: showHeater() ? HEATER_CELL : 0, cups: !!showCups() })
  // When the browser takes the GPU device away the lamp cannot go on (see createGpuSimulation):
  // say so and start the page over, which asks for a device again. Not more than three times in
  // two minutes, so a GPU that is gone for good does not reload the page forever; after that
  // the lamp stays stopped with the reason on screen.
  const onLost = info => {
    let losses = []
    try { losses = JSON.parse(sessionStorage.getItem('lavalamp.app-gpu-lost') || '[]').filter(t => Date.now() - t < 120000) } catch (e) { /* no storage */ }
    losses.push(Date.now())
    try { sessionStorage.setItem('lavalamp.app-gpu-lost', JSON.stringify(losses)) } catch (e) { /* no storage */ }
    if (losses.length > 3) { notify('GPU lost again (', info.reason || 'unknown', '): lamp stopped'); return }
    notify('GPU lost (', info.reason || 'unknown', '): restarting the lamp')
    setTimeout(() => location.reload(), 1500)
  }
  const sim = device
    ? createGpuLamp({ device, width, height, params, onLost })
    : remote
      ? createWorkerLamp({ width, height, params, seed: seed(), frame: FRAME, pace: pace(), want: overlayWants() })
      : createSimulation({ width, height, params })
  backendLabel(device ? 'GPU (WebGPU)' : remote ? 'CPU, simulation on a worker thread' : 'CPU, simulation on the page thread')
  // A visitor who tuned the old lamp is told their settings are kept and where it lives.
  const v1Banner = v1SettingsBanner()
  if (v1Banner) document.body.append(v1Banner)
  // ?still: the still test's lamp (docs/methods/measured-hunt.md). The lava as spawned, then
  // everything zeroed (temperature, velocity, the kick's memory), no heat, no stirring, the
  // reservoirs not drawn, so what moves afterwards is the solver and gravity and nothing else
  // (Robert: "a static environment should produce static lava except for the small jitter that
  // all atoms actually have irl"). For measuring, like ?profile; the knobs still read as loaded.
  // The overrides are reapplied every frame: fit() moves window-following defaults and their
  // mirrors would put Stir 20 and Turb 150 back.
  const still = new URLSearchParams(window.location.search).has('still')
  const STILL = { stir: 0, turbulence: 0, drifters: 0, floorHeat: 0, floorGlow: 0, elementHeat: 0, heatSpots: 1e9, maxTemp: 0 }
  if (still) {
    Object.assign(params, STILL)
    showCups(false)
    particleSize(1) // Robert: "set the particle size to 1 and smooth to 0 so I can see the particles moving"
    smooth(0)
    if (sim.core && sim.core.calm) sim.core.calm()
  }
  const renderer = createRenderer(lamp, look)
  const motion = createMotionInput()
  // In the Reservoirs view the lamp is drawn scaled down and shifted (see `view` in frame), so a
  // finger on the glass has to be mapped back through that as well, or it lands below where it
  // touched (Robert: "touch controls dont' seem to be workign on gpu", with the view on).
  let shownView = null
  const toLamp = (px, py) => {
    const [lx, ly] = pageToLamp(turns, pageWidth, pageHeight, width, height, px, py)
    return shownView ? [(lx - shownView.ox) / shownView.k, (ly - shownView.oy) / shownView.k] : [lx, ly]
  }
  const pointer = createPointerInput(lamp, toLamp)
  const settingsPanel = createSettingsPanel()
  // Sound, switched on from the panel's toggle (a click, which is what the browser wants first).
  const gloop = createGloop()
  gloop.setBed(soundBed())
  soundBed.subscribe(name => gloop.setBed(name))
  sound.subscribe(on => { soundPending(!!on); gloop.set(on).then(() => soundPending(false)) })
  // Music: the switch starts listening (a click, the gesture the microphone wants); the source
  // can be changed while listening. A failure (no permission, no audio in the tab) puts the
  // switch back off and says why.
  const listener = createMusic()
  // The chosen audio input (a loopback such as BlackHole hears every app), remembered here.
  const DEVICE_KEY = 'lavalamp.app-v2-music-device'
  try { listener.device = localStorage.getItem(DEVICE_KEY) || '' } catch (e) {}
  settingsPanel.setMusicInputs && settingsPanel.setMusicInputs({
    list: () => listener.inputs(),
    get: () => listener.device,
    set: id => { listener.device = id; try { localStorage.setItem(DEVICE_KEY, id) } catch (e) {} if (music() && musicSource() === 'mic') listen() }
  })
  // The File source's song, as read by the panel's picker, and kept in this browser's own
  // storage (IndexedDB, nothing leaves the machine) so a reload has it ready: one click on
  // Listen or Record plays it (Robert: "if I save settings it'll repick the same mp3"). The
  // browser will not start sound before a click, so that one is still needed.
  let musicFile = null
  const SONG_DB = 'lavalamp-song'
  const songStore = mode => new Promise((resolve, reject) => {
    const open = indexedDB.open(SONG_DB, 1)
    open.onupgradeneeded = () => open.result.createObjectStore('song')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => resolve(open.result.transaction('song', mode).objectStore('song'))
  })
  const keepSong = async (name, data) => {
    try { const store = await songStore('readwrite'); store.put({ name, data }, 'last') } catch (e) {}
  }
  ;(async () => {
    try {
      const store = await songStore('readonly')
      const req = store.get('last')
      req.onsuccess = () => { if (req.result && !musicFile) { musicFile = req.result.data; musicFileName(req.result.name) } }
    } catch (e) {}
  })()
  window.addEventListener('lavalamp-music-file', e => {
    musicFile = e.detail.data
    musicFileName(e.detail.name)
    keepSong(e.detail.name, e.detail.data)
    if (musicSource() !== 'file') musicSource('file')
    else if (music()) listen()
  })
  let listening = Promise.resolve()
  const listen = () => (listening = (async () => {
    if (musicSource() === 'file' && !musicFile) { music(false); notify('Music: ', 'choose a song first'); return }
    musicPending(true)
    try { await listener.start(musicSource(), musicSource() === 'file' ? { data: musicFile, audible: true } : undefined) } catch (e) { music(false); notify('Music: ', listener.error || 'could not listen') }
    musicPending(false)
  })())
  // Record (the File source): the song from the top, and the lamp's canvas with the song's own
  // sound into one video, saved when the song ends or Record is switched off. From inside the
  // page, so it needs no screen recording permission and the sound is exactly in time.
  let recorder = null
  const startRecording = async () => {
    if (musicSource() !== 'file' || !musicFile) { musicRecording(false); notify('Record: ', 'choose a song under Music, File'); return }
    if (music()) await listen(); else { music(true); await listening }
    const audio = listener.fileStream
    if (!audio || !musicRecording()) { musicRecording(false); return }
    const stream = new MediaStream([...lamp.captureStream(60).getVideoTracks(), ...audio.getAudioTracks()])
    const type = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t))
    const chunks = []
    const take = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 16e6, audioBitsPerSecond: 256e3 })
    take.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    take.onstop = () => {
      for (const t of stream.getVideoTracks()) t.stop()
      const blob = new Blob(chunks, { type: take.mimeType })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `lavalamp-${(musicFileName() || 'song').replace(/[^\w.-]+/g, '-')}.${take.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 10000)
    }
    take.start(1000)
    recorder = take
  }
  musicRecording.subscribe(on => {
    if (on) startRecording()
    else if (recorder) { const take = recorder; recorder = null; if (take.state !== 'inactive') take.stop() }
  })
  listener.onFileEnd = () => { if (musicRecording()) musicRecording(false) }
  const TRAIN_MIN = 2
  const TRAIN_MAX = 6
  const TRAIN_DEFAULT = 4 // a kind's first train, with no last hit to time it by
  let train = null // { left, last, period } while a train of globs runs
  const trainLastAt = { mid: -1e9 }
  let lastTrainAt = -1e9
  const TRAIN_GAP = 2 // seconds from one train's start to the next's at least
  const TRAIN_STEP = 0.22 // seconds between a train's globs
  const TRAIN_GLOB = 0.05 // seconds of the lamp's time the lid lifts for each glob
  const MID_HIT_RISE = 2.5
  const MID_HIT_BASS = 1 // the bass's rise under this: not a kick
  let dropCharged = false // a pot is lidded and heating (see driveMusic)
  // Off puts every knob the music drives back to the knob's own value, and lets a lidded pot go.
  const unMusic = () => { if (dropCharged && sim.chargePot) sim.chargePot(0); dropCharged = false; train = null; tempoPace = 1; params.floorHeat = floorHeat(); params.liftCap = lift(); params.turbulence = turbulence(); params.wobbleKick = wobbleKick(); params.drifters = drifters(); params.ceilingCool = 1 }
  music.subscribe(on => { if (on) { musicLog.length = 0; musicLogStart = listener.time; listen() } else { listener.stop(); unMusic() } })
  musicSource.subscribe(() => { if (music()) listen() })
  // What the music does to the lamp, once a frame: the knobs' values are the baseline and the
  // bands add to them, so a quiet room is the lamp as tuned (see settings.js, musicFloor and
  // the rest). A beat lights a pot through the simulation's own lighting.
  const musicMeter = { bass: 0, mid: 0, high: 0, beat: 0 }
  const musicRanges = { beat: [0, 0], heat: [0, 0], eddy: [0, 0], kick: [0, 0] }
  let beatsHeard = 0
  let lastMusicAt = performance.now()
  let tempoPace = 1 // the pace's multiplier from the music's tempo, 1 with no music
  const spectrumView = createSpectrumView()
  document.body.append(spectrumView.element)
  spectrumView.show(showSpectrum())
  showSpectrum.subscribe(on => spectrumView.show(on))
  // The leads, in seconds of the lamp's own time: an eddy spins up over half a second
  // (simulation.js, driftEnvelope). They are turned into real seconds by the pace. The analyser hears a beat about AUDIO_LAG
  // late (its smoothing and the frame), and the clock is built from those late beats, so every
  // lead carries it too.
  const EDDY_LEAD = 0.5
  const AUDIO_LAG = 0.04
  // For each move, the last beat number it was fired for, so it fires once a beat.
  const firedFor = { pot: -1, eddy: -1, pulse: -1 }
  let wasLocked = false
  const DROP_WAIT = 2 // seconds without a kick before the drop's pot is charged
  const DROP_GAP = 6 // seconds: one drop at most this often (8 let Drugs I Like's kick coming in at 0:36.6 block its drop at 0:44)
  const DROP_SETTLE = 6 // seconds after Listen before a drop can be: the averages start from the silence before the music (the test's first kick, and the first second of Drugs I Like, read as drops)
  let lastDropAt = -1e9
  const BUFFER = 0.35 // of the lava, in the pots and the bottom fifth of the tank
  let bufferAt = -1e9
  let lavaLow = false
  const CEILING_COOL = 5
  const VENT_TIME = 0.3 // seconds the lid is lifted for
  // Seconds between pots on deep notes: 3 skipped C-C's 0:57.1 (1.9 s after the one at the drop);
  // 1.5 keeps C-C's, 1.75 to 3.5 s apart, and half of Bangarang's, about 1.1 s apart.
  const BOOM_POT_GAP = 1.5
  // A deep note within this of a drop is the drop's own: the drop at 0:55.2 opened the big pot,
  // and the boom at the note's peak opened a second one 0.02 s later.
  const BOOM_AFTER_DROP = 1
  // A beat's pot waits BEAT_POT_WAIT, and is let go if a deep note's attack is heard meanwhile:
  // the attack's kick can be heard a frame or two before the attack counts, and its pot spent the
  // charge the boom wanted (C-C 1:15.62 and 1:15.64, 1:22.52 and 1:22.60).
  const BEAT_POT_WAIT = 0.035
  let beatPotAt = -1
  let lastBoomPotAt = -1e9
  const SILENT_DB = -65 // the analyser's floor is -80; a song's quietest bars sit around -55
  const SILENT_AFTER = 15 // seconds
  let silentFor = 0
  let musicResting = false
  let wobbleNext = 3 // the wobble note of this run the next eddy comes on
  const musicLog = []
  let musicLogAt = 0
  let musicLogStart = 0
  let musicLogBeats = 0
  let musicLogHats = 0
  let musicLogPots = 0
  let musicLogDrops = 0
  let musicLogBooms = 0
  const MUSIC_LOG_COLUMNS = ['t', 'activity', 'loud', 'full', 'onsets', 'surge', 'power', 'bassRise', 'midsRise', 'beats', 'hats', 'pots', 'drops', 'clock (0 free, 1 coasting, 2 hearing)', 'bpm', 'calm', 'booms', 'eddies floor', 'wobble', 'lava low']
  // Save the recorder as a file, from the Music card's button (an event, so the panel needs no
  // handle on the lamp); it starts again each time Listen is switched on.
  window.addEventListener('lavalamp-music-log', () => {
    const blob = new Blob([JSON.stringify({ columns: MUSIC_LOG_COLUMNS, settings: getSettings(), rows: musicLog })], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `lavalamp-music-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  })
  const driveMusic = dt => {
    if (!listener.enabled) return
    let dropped = false
    musicRanges.beat[0] = musicBeatLo(); musicRanges.beat[1] = musicBeatHi()
    musicRanges.heat[0] = musicHeatLo(); musicRanges.heat[1] = musicHeatHi()
    musicRanges.eddy[0] = musicEddyLo(); musicRanges.eddy[1] = musicEddyHi()
    musicRanges.kick[0] = musicKickLo(); musicRanges.kick[1] = musicKickHi()
    const m = listener.update(dt, musicSensitivity(), musicRanges)
    // Silence: with Listen on and nothing playing, the closed pot charged on and the knobs stayed
    // where the music left them, so every pot sat hot (Robert: "when music is enabled but there is
    // silence, all the pots get stuck hot. we should turn off the effects of music mode after 15
    // seconds and turn them back on once there's sound again"). After SILENT_AFTER seconds under
    // SILENT_DB the lamp is its own again (unMusic: the knobs, the lid let go); the meter still
    // moves, and the first sound picks the music back up.
    silentFor = m.powerDb < SILENT_DB ? silentFor + dt : 0
    if (silentFor > SILENT_AFTER) {
      if (!musicResting) { unMusic(); musicResting = true }
      musicMeter.bass = m.heat; musicMeter.mid = m.eddy; musicMeter.high = m.kick; musicMeter.beat *= 0.85
      if (settingsPanel.meter) settingsPanel.meter(musicMeter)
      return
    }
    musicResting = false
    const clock = listener.clock
    // The song's sections: the activity, 0 in a breakdown to 1 in the fullest part, made a gain
    // about 1 by the Activity knob, so a breakdown calms the lamp and a chorus busies it.
    const act = Math.max(0, Math.min(1, m.activity))
    const busy = Math.max(0.05, 1 + musicActivity() * (2 * act - 1))
    // m.heat, not m.bass: after the ranges came in this read a name that no longer existed, the
    // floor heat and Lift became NaN every frame, and the whole pool read hot with artifacts
    // (Robert: "The music mode is causing all of the lava to stay completely hot the whole time").
    params.floorHeat = floorHeat() * (1 + musicFloor() * m.heat)
    params.liftCap = lift() * (1 + musicLift() * m.heat)
    params.turbulence = turbulence() * busy * (1 + musicTurb() * m.eddy)
    params.wobbleKick = wobbleKick() * (1 + musicKick() * m.kick)
    // The ceiling bottles cool faster the more active the music, as the pace follows the tempo, up
    // to CEILING_COOL times at the fullest (Robert: "a big drop got the lava too hot and sent it to
    // the top. we should add cooling bottles at the top to help when they're filled with very hot
    // lava to help move it back down and get ready for another drop. the rate of cooling should be
    // relative to how active the lamp is, similar to how the speed is affected"). GPU lamp.
    params.ceilingCool = 1 + (CEILING_COOL - 1) * act
    const chance = Math.min(2, busy)
    // The moves on the beat. Locked to the clock, each fires its lead ahead of the predicted
    // beat, so it lands on it: the latest beat within its lead, once. Not locked (the song's
    // start, a breakdown with no kick), they fire on the beat as heard, late but never wrong.
    const pace1 = Math.max(0.05, pace() * tempoPace)
    // Each move's lead in real seconds.
    const leadOf = name => Math.max(0, (name === 'pot' ? musicLead() : name === 'eddy' ? EDDY_LEAD / pace1 : 0) + AUDIO_LAG)
    // The next beat is number clock.index + 1, clock.until seconds away, the ones after it a
    // period apart: the latest within the lead, if it has not had this move yet.
    const latestWithin = name => clock.index + 1 + Math.floor((leadOf(name) - clock.until) / clock.period)
    const due = name => {
      if (!clock.locked || leadOf(name) < clock.until) return false
      const beat = latestWithin(name)
      if (beat <= firedFor[name]) return false
      firedFor[name] = beat
      return beat
    }
    // Newly locked: start each move from the beat it is now inside the lead of, not a burst.
    if (clock.locked && !wasLocked) for (const k in firedFor) firedFor[k] = latestWithin(k)
    wasLocked = clock.locked
    const pulse = () => { if (sim.pulseWave && Math.random() < musicPulse() * chance) sim.pulseWave() }
    const spawn = () => { if (sim.spawnEddy && Math.random() < musicSpawn() * act * chance) sim.spawnEddy() }
    const every = () => Math.max(1, Math.round(musicEvery())) * (musicActivity() > 0 && act < 0.3 ? 2 : 1)
    let fired = false
    const potNow = () => { fired = true; if (sim.lightElement) sim.lightElement() }
    // Every counts from the beat the section began on (the drop, or the lock), so the pots fall
    // on the phrase. In a breakdown the clock coasts and everything that rides the kick pauses;
    // the drop is met by the lidded pot instead (below), not by guessing the phrase.
    const onPhrase = beat => (beat - clock.sectionAt) % every() === 0
    // The pots, lidded (Robert: "close the pot and super heat it? then just delete the lid and
    // have it take of instantly?"; "Then we'd want to prepare another pot to match a coming
    // beat"). With Drop on, one pot is always closed and superheating; on the beat it opens and
    // is blasted, so the glob leaves on the beat as heard, with no lead to guess, and the next
    // biggest cold pot closes. It opens on every Every-th beat on the phrase, and on the first
    // kick after the kick has been gone DROP_WAIT seconds (a breakdown, or the start before any
    // kick): that is the drop, and a breakdown has charged its pot all the while, so it goes up
    // the hottest. Drop 0 is the pots as before: lit Lead seconds ahead of a predicted beat.
    // A calm part (music.js's section, by level against the song's reference, or the kick gone)
    // is left to the lamp's own clocks: no pots on the beat, and the lid sits on the biggest pot,
    // charging for the drop (Robert: "The whole lamp should be relatively calm, with maybe some
    // eddies spawning and normal lamp firings"). A drop is music.js's (a surge out of a calm
    // part up to the reference, or the first kick after the bass was cut): the big pot opens
    // and two eddies come in ("I would expect to see a big pot fire and probably an eddie
    // or two spawn at the same time because of all the activity"). Then the beat pots, while busy.
    const lidded = musicDrop() > 0 && !!sim.chargePot
    const calm = m.sinceBeat > DROP_WAIT || m.calm
    if (lidded) { sim.chargePot(2 * musicDrop(), calm); dropCharged = true } else if (dropCharged && sim.chargePot) { sim.chargePot(0); dropCharged = false }
    const heardNumber = clock.locked ? (clock.until < clock.period / 2 ? clock.index + 1 : clock.index) : -1
    const musicNow = listener.time
    // The drop is music.js's alone: a surge out of a calm part, or the bass back after a cut. The
    // first kick after two seconds without one, here before, fired in C-C's intro (10.1, 23.8 s live)
    // and missed Drugs I Like's drop by 70 ms.
    const isDrop = m.drop && musicNow - lastDropAt > DROP_GAP && musicNow - musicLogStart > DROP_SETTLE
    if (m.beat) beatsHeard++
    // The lava buffer (Robert: "I think we have a lava starvation problem. We should try to keep a
    // lava buffer in the pots so that we always can fire something"). Measured on Bangarang, live:
    // the ceiling bottles held 46% of the lava by 0:20 and 67% by 0:40, the pots and the pool 14%,
    // then from 0:58 to 1:08 the pots 2 to 4% and the pool 4 to 5% while it rained back down (with
    // no music the ceiling holds 10 to 20%). Twice a second the lamp counts its lava; while the
    // pots and the bottom fifth of the tank hold under BUFFER of it, the everyday pots (on the
    // beat, on a deep note, a vent) wait, and the big moments (a drop, a stab) still go.
    if (musicNow - bufferAt >= 0.5 && sim.state && sim.count) {
      bufferAt = musicNow
      const st = sim.state, n = sim.count, H = sim.height || window.innerHeight
      let low = 0
      for (let i = 0; i < n; i++) if (st.y[i] > 0.8 * H) low++
      lavaLow = low / n < BUFFER
    }
    // A deep note's attack is also a kick: its beat pot spent the charge, and the boom at the
    // note's peak a few frames later opened a pot closed that instant, with nothing in it (C-C
    // 1:02.22 and 1:02.26, 1:15.61 and 1:15.64; Robert: "the bwongs on c-c are still not
    // triggering the pots... sometimes it does seem like it fires, but I'm not sure why the
    // inconsistency"). While a boom waits for its peak, the beat pots wait too.
    const onBeatPot = m.beat && !calm && !lavaLow && !m.boomPending && (clock.locked ? onPhrase(heardNumber) : beatsHeard % every() === 0)
    const open = strength => { if (sim.dropPot) sim.dropPot(strength); fired = true }
    // A bass hit (a deep note, a beat on the phrase) is a wave: one vent of the closed pot, the
    // wave form Robert liked ("I really like the wave forms the pulsing releases are, we should make
    // those what happens for any bass trigger"; then "Let's keep waves as bass (looks really cool),
    // and use trains when triggered by something that has like high frequence, like mid bass or
    // so"). A mid hit (the mids rising MID_HIT_RISE times their average with the bass not rising,
    // a snare or a stab: 0.14 to 0.30 a second through the busy parts at 3, 0.7 to 0.85 at 2) is a
    // train of globs, TRAIN_STEP apart, as many as the beats since the last mid hit, TRAIN_MIN to
    // TRAIN_MAX ("can we tell based on timing whether we should do 2,3,4,8,16 pulses?... probably
    // max is like 6 pulses per pot"), one at a time and TRAIN_GAP apart at least. Only ever the
    // small pot a busy part closes, never the drop's big one (three reserves, tried first, broke
    // the drop: "the reservoir broke the drop, yeah, let's add trains first").
    const wave = () => { if (sim.ventPot) sim.ventPot(VENT_TIME, true); fired = true }
    const startTrain = kind => {
      if (train) return
      const period = clock.locked ? clock.period : m.bpm > 40 ? 60 / m.bpm : 0.5
      const since = musicNow - trainLastAt[kind]
      const count = since > 0 && since < 10 ? Math.max(TRAIN_MIN, Math.min(TRAIN_MAX, Math.round(since / period))) : TRAIN_DEFAULT
      trainLastAt[kind] = musicNow
      lastTrainAt = musicNow
      train = { left: count - 1, last: musicNow, period }
      if (sim.ventPot) sim.ventPot(TRAIN_GLOB, true)
      fired = true
    }
    if (isDrop) {
      lastDropAt = musicNow
      dropped = true
      if (lidded) open(musicDrop() * 1.5)
      if (sim.spawnEddy) { sim.spawnEddy(); sim.spawnEddy() }
      // The eddies already turning swing round on the drop (Robert: "the eddies could abruptly
      // switch directions up to one time during their life time triggered by rareish music
      // events"); the two just asked for are born after this and keep their spin.
      if (sim.flipEddies && musicFlip() > 0) sim.flipEddies(musicFlip())
    } else if (m.stab && calm && lidded) {
      // A stab out of a calm part (music.js): the pot that has been charging all through it goes,
      // and nothing else changes (Robert: "send a bolt of lightning did not release a pot! one
      // was ready though"; "don't change anythign else").
      open(musicDrop() * 1.5)
    } else if (m.boom && !calm && !lavaLow && musicBoom() > 0 && musicNow - lastBoomPotAt >= BOOM_POT_GAP && musicNow - lastDropAt >= BOOM_AFTER_DROP) {
      // A deep note (music.js, the boom): a burst of lava with it, the lidded pot blasted by Boom,
      // or with Drop 0 a pot lit as it is heard; at most every BOOM_POT_GAP, since dubstep's sub
      // lands every bar (Bangarang: about one a second through its full parts, against C-C's
      // one every 3.45 s).
      lastBoomPotAt = musicNow
      if (sim.flipEddies && musicFlip() > 0) sim.flipEddies(musicFlip() / 8)
      if (lidded) wave(); else potNow()
      beatPotAt = -1
    } else if (lidded && onBeatPot) beatPotAt = musicNow
    else if (lidded && !calm && !m.beat && m.raw.midsRise > MID_HIT_RISE && m.raw.rise < MID_HIT_BASS && musicNow - lastTrainAt >= TRAIN_GAP) startTrain('mid')
    else if (lidded && m.beat && !train && !lavaLow && Math.random() < musicVent()) {
      // A vent (Robert: "what if we occasionally pulse the pre heated pots to release pulses of
      // heat to match the music"): on a beat that opens nothing, now and then the charged pot's
      // lid lifts for VENT_TIME and a puff of its lava goes up with the beat.
      if (sim.ventPot) sim.ventPot(VENT_TIME)
    }
    if (beatPotAt >= 0) {
      if (m.boomPending || m.boom || fired) beatPotAt = -1 // a drop, a stab or a boom has the pot
      else if (musicNow - beatPotAt >= BEAT_POT_WAIT) { beatPotAt = -1; if (lidded) wave() }
    }
    // The train's globs, TRAIN_STEP apart, separate but in quick succession (on each beat they
    // stayed hot and shot up as white spheres); a calm part or a drop ends it, and the closed pot
    // is handed back for a fresh one.
    if (train) {
      const since = musicNow - train.last
      if (calm || train.left <= 0 || musicNow - lastDropAt < 0.5) { train = null; if (sim.retirePot) sim.retirePot() }
      else if (since >= TRAIN_STEP) { train.left--; train.last = musicNow; if (sim.ventPot) sim.ventPot(TRAIN_GLOB, true) }
    }
    // A busy part keeps at least Busy eddies alive, never fewer than the Eddies knob.
    params.drifters = calm ? drifters() : Math.max(drifters(), musicBusyEddies())
    if (clock.locked) {
      const w = due('pulse')
      if (w !== false && clock.hearing) pulse()
      const e = due('eddy')
      if (e !== false) { if (clock.hearing) spawn(); if (onPhrase(e) && sim.spawnEddy) sim.spawnEddy() }
      const p = !lidded && musicLead() > 0 ? due('pot') : false
      if (p !== false && clock.hearing && onPhrase(p) && !lavaLow) potNow()
      if (!lidded && musicLead() <= 0 && onBeatPot) potNow()
    } else if (m.beat) {
      pulse(); spawn()
      if (beatsHeard % every() === 0) { if (!lidded && !lavaLow) potNow(); if (sim.spawnEddy) sim.spawnEddy() }
    }
    // A wobble brings eddies while it sweeps, up to Wobble a second at its fullest (Robert: "is
    // there a way to detect that sort of wahwahwah sound that sounds kind of spinny and trigger
    // eddies more frequently?").
    // Counted in its notes (each sweep of the filter): an eddy on the 2nd to 4th note of a run,
    // then one every 2 to 6 notes while it keeps on, fewer with the Wobble knob down ("maybe like
    // on the second to fourth note of something that looks like a wobble trigger an eddie and
    // keep spawning the eddies more frequently. not necessarily constantly").
    if (m.wobbleRun === 0) wobbleNext = 2 + Math.floor(Math.random() * 3)
    if (m.wobbleNote && m.wobbleRun >= wobbleNext && musicWobble() > 0) {
      wobbleNext = m.wobbleRun + Math.ceil((2 + Math.random() * 4) / musicWobble())
      if (!calm && sim.spawnEddy) sim.spawnEddy()
    }
    // A hat brings a spinning eddy now and then, more often in a busy part.
    if (m.hat && sim.spawnEddy && Math.random() < musicSpin() * act * chance * 0.25) sim.spawnEddy()
    // Pace follows the tempo a little: against 120 bpm, by Tempo, held to 0.75 to 1.3 times,
    // eased over two seconds so it breathes rather than jumps.
    if (m.bpm > 40) {
      const target = Math.max(0.75, Math.min(1.3, 1 + musicTempo() * (Math.max(0.6, Math.min(1.6, m.bpm / 120)) - 1)))
      tempoPace += (target - tempoPace) * Math.min(1, dt / 2)
    }
    if (showSpectrum()) spectrumView.draw(listener.spectrum(), m, musicRanges, fired || dropped, clock.tick)
    // The recorder: ten rows a second of what the lamp heard and did, for tuning against a song
    // (Robert's C-C: calm to 0:54, the drop, busy to 1:50). Saved from the Music card.
    musicLogBeats += m.beat ? 1 : 0
    musicLogHats += m.hat ? 1 : 0
    if (fired) musicLogPots++
    if (dropped) musicLogDrops++
    if (m.boom) musicLogBooms++
    if (musicNow - musicLogAt >= 0.1) {
      musicLogAt = musicNow
      musicLog.push([+(musicNow - musicLogStart).toFixed(2), +m.activity.toFixed(3), +m.parts.loud.toFixed(3), +m.parts.full.toFixed(3), +m.parts.onsets.toFixed(3), +m.surge.toFixed(2), +(m.raw.total || 0).toExponential(2), +(m.raw.rise || 0).toFixed(2), +(m.raw.midsRise || 0).toFixed(2), musicLogBeats, musicLogHats, musicLogPots, musicLogDrops, clock.locked ? (clock.hearing ? 2 : 1) : 0, m.bpm, calm ? 1 : 0, musicLogBooms, params.drifters, +m.wobble.toFixed(2), lavaLow ? 1 : 0])
      musicLogBeats = musicLogHats = musicLogPots = musicLogDrops = musicLogBooms = 0
      if (musicLog.length > 6000) musicLog.shift() // ten minutes
    }
    musicMeter.bass = m.heat; musicMeter.mid = m.eddy; musicMeter.high = m.kick
    if (m.beat) musicMeter.beat = 1; else musicMeter.beat *= 0.85
    if (settingsPanel.meter) settingsPanel.meter(musicMeter)
  }
  // Fullscreen: the switch asks the browser, and the browser's own changes (Esc, the window's
  // button) are read back so the switch stays honest. The lamp refits on the resize that follows.
  const root = document.documentElement
  const inFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement)
  fullscreen.subscribe(on => {
    if (on === inFullscreen()) return
    const request = on ? (root.requestFullscreen || root.webkitRequestFullscreen) : (document.exitFullscreen || document.webkitExitFullscreen)
    if (!request) { fullscreen(false); return } // iPhone Safari has no page fullscreen
    Promise.resolve(request.call(on ? root : document)).catch(() => fullscreen(inFullscreen()))
  })
  for (const event of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(event, () => fullscreen(inFullscreen()))

  // Size the lamp to the page for the current turn, and keep the window-following defaults honest.
  function fit () {
    [pageWidth, pageHeight] = pageSize();
    [width, height] = lampSizeFor(turns, pageWidth, pageHeight)
    sim.resize(width, height)
    renderer.resize(width, height)
    lamp.style.transform = `rotate(${turns * 90}deg)`
    refitDefaults(width, height)
  }
  fit()
  window.addEventListener('resize', fit)
  pixels.subscribe(() => renderer.resize(width, height))
  // Auto Pixels (see settings.js). The rungs are the budgets under the window's own size and
  // then that size exactly, so the top is 1:1 with the screen and not a round number (Robert:
  // "it should reach exactly 1:1 with the current resolution not arbitrarily 3.0"). Up a rung
  // after one second at half again over Target, down a rung after two seconds under it, and a
  // rung that was just stepped down from is not tried again for half a minute, so it settles
  // rather than hunts. A change of Pixels not made here is the hand on the knob: auto off.
  const nativePixels = () => window.innerWidth * window.innerHeight / 1e6
  const pixelLadder = () => { const native = nativePixels(); const rungs = [0.5, 1, 1.5, 2, 3, 4, 6, 8].filter(r => r < native); rungs.push(native); return rungs }
  let autoSetting = false
  pixels.subscribe(() => { if (!autoSetting) autoPixels(false) })
  let slowSeconds = 0
  let fastSeconds = 0
  let failedRung = -1
  let failedUntil = 0
  const autoPixelsTick = fps => {
    if (!autoPixels()) { slowSeconds = 0; fastSeconds = 0; return }
    const ladder = pixelLadder()
    let rung = 0
    for (let k = 0; k < ladder.length; k++) if (Math.abs(ladder[k] - pixels()) < Math.abs(ladder[rung] - pixels())) rung = k
    const target = targetFps()
    slowSeconds = fps < target ? slowSeconds + 1 : 0
    fastSeconds = fps > target * 1.5 ? fastSeconds + 1 : 0
    let next = null
    if (slowSeconds >= 2 && rung > 0) { failedRung = rung; failedUntil = performance.now() + 30000; next = rung - 1 }
    else if (fastSeconds >= 1 && rung < ladder.length - 1 && !(rung + 1 === failedRung && performance.now() < failedUntil)) next = rung + 1
    if (next !== null) { autoSetting = true; pixels(ladder[next]); autoSetting = false; slowSeconds = 0; fastSeconds = 0 }
  }

  // Turn the lamp so its floor is on `newEdge`, carrying every particle to where it was on the
  // page, so the lava stays put and gravity simply starts pulling it toward the new floor.
  function turnTo (newEdge) {
    const before = { turns, pageWidth, pageHeight, width, height }
    edge = newEdge
    turns = TURNS[edge]
    fit()
    sim.transform((x, y) => {
      const [px, py] = lampToPage(before.turns, before.pageWidth, before.pageHeight, before.width, before.height, x, y)
      return toLamp(px, py)
    })
    if (!sim.remote) remember()
  }

  // Keeping the screen awake. The browser's own Screen Wake Lock first (a secure context only),
  // taken again whenever the page comes back into view, since the browser drops it every time
  // the page is hidden; NoSleep's looping video where there is no such API. Each outcome goes on
  // the panel, so a phone can say what happened (Robert: "the screen lock no longer works on my
  // android phone"; nothing of that can be seen from the laptop).
  let wakeLock = null
  let noSleep = null
  const keepAwake = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen')
        screenLabel('Screen: kept awake (Wake Lock API)')
        wakeLock.addEventListener('release', () => { if (document.visibilityState === 'visible') screenLabel('Screen: wake lock released by the browser') })
        return true
      } catch (e) {
        screenLabel(`Screen: wake lock refused (${e.name}: ${e.message})`)
        return false
      }
    }
    if (typeof NoSleep !== 'undefined') {
      try {
        noSleep = noSleep || new NoSleep()
        await noSleep.enable()
        screenLabel(window.isSecureContext ? 'Screen: kept awake (NoSleep video)' : 'Screen: kept awake by NoSleep video; not a secure context (needs https) so no Wake Lock API')
        return true
      } catch (e) {
        screenLabel(`Screen: NoSleep failed (${e.name}: ${e.message})`)
        return false
      }
    }
    screenLabel('Screen: no way to keep it awake here' + (window.isSecureContext ? '' : ' (not a secure context: needs https)'))
    return false
  }
  // Browsers only allow the wake lock and the motion sensors from inside a user gesture. A tap
  // ends in pointerup and click both; the first of either does it.
  let gestureSeen = false
  const onFirstGesture = () => {
    if (gestureSeen) return
    gestureSeen = true
    for (const event of ['click', 'pointerup', 'keydown']) document.removeEventListener(event, onFirstGesture)
    keepAwake().then(ok => { if (ok) notify('Wake Lock Activated') })
    motion.requestPermission()
    motionLabel(motion.status())
  }
  for (const event of ['click', 'pointerup', 'keydown']) document.addEventListener(event, onFirstGesture)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && gestureSeen && 'wakeLock' in navigator) keepAwake() })
  motionLabel(motion.status())
  setInterval(() => motionLabel(motion.status()), 1000)

  lamp.addEventListener('click', settingsPanel.close)
  const settingsButton = document.getElementById('settings')
  settingsButton.addEventListener('click', settingsPanel.open)

  document.body.append(
    div(
      {
        style: {
          position: 'fixed',
          display: 'flex',
          'justify-content': 'center',
          'align-items': 'center',
          'z-index': -100,
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          background: bgColor.bindStyle(() => `rgb(${bgColor().r}, ${bgColor().g}, ${bgColor().b})`)
        }
      },
      lamp,
      div(
        {
          style: {
            position: 'fixed',
            top: '10px',
            left: '20px',
            cursor: 'pointer',
            'z-index': 10
          }
        },
        settingsButton
      )
    ),
    sub(
      {
        style: {
          'font-size': '10px',
          position: 'fixed',
          bottom: '2px',
          left: '2px',
          'z-index': 200,
          display: fullscreen.bindStyle(() => fullscreen() ? 'none' : 'block') // nothing but lava in fullscreen
        }
      },
      a({ target: '_blank', href: 'https://github.com/snowbldr/lavalamp.app' }, 'Copyright © 2020-2026 Robert Kempton')
    )
  )

  // Pace is slow motion, not a smaller step: the sim always steps by FRAME, which every tuned
  // number assumes, but only on `pace` of the frames, and the drawing interpolates between the
  // last two sim states so it stays smooth. At pace 1 it steps and draws every frame as before.
  const shown = { x: new Float32Array(0), y: new Float32Array(0), temp: null }
  let due = 1
  // ?profile in the URL: average sim and render time per frame, printed every two seconds and
  // kept on window.lavaProfile, for finding what a slow device is spending its time on.
  const profiling = new URLSearchParams(window.location.search).has('profile')
  look.profile = profiling
  if (profiling) window.lavalamp = { sim, params, look, gloop, device, music: listener, musicLog } // for timing the running lamp from the console
  const tally = { frames: 0, sim: 0, steps: 0, render: 0, span: 0, last: performance.now(), phases: {} }
  // The busiest 20 px cell, in particles: 40 or so is lava at rest, hundreds is a pile the
  // solver's neighbour loops pay for (the eddies packing the pots was 814, and single digit fps).
  const crowd = () => {
    const { x, y } = sim.state
    const cols = Math.ceil(sim.width / 20) + 1
    const counts = new Map()
    let max = 0
    for (let i = 0; i < sim.count; i++) {
      const k = Math.floor(x[i] / 20) + Math.floor(y[i] / 20) * cols
      const c = (counts.get(k) || 0) + 1
      counts.set(k, c)
      if (c > max) max = c
    }
    return max
  }
  const report = () => {
    const out = {
      crowd: crowd(),
      fps: (tally.frames / (tally.span / 1000)).toFixed(1),
      frameMs: (tally.span / tally.frames).toFixed(2),
      simMs: (tally.sim / tally.frames).toFixed(2),
      stepsPerFrame: (tally.steps / tally.frames).toFixed(2),
      renderMs: (tally.render / tally.frames).toFixed(2),
      pixels: renderer.pixels(),
      particles: sim.count,
      renderer: renderer.kind || 'canvas'
    }
    if (sim.remote) {
      const w = sim.profile()
      out.workerStepMs = w.stepMs.toFixed(2)
      out.workerGapMs = w.gap.toFixed(1)
    }
    for (const k in tally.phases) out[k] = (tally.phases[k] / tally.frames).toFixed(2)
    window.lavaProfile = out
    console.log('[profile]', JSON.stringify(out))
    tally.frames = 0; tally.sim = 0; tally.steps = 0; tally.render = 0; tally.span = 0; tally.phases = {}
  }
  let leaning = 0 // seconds gravity has pointed at an edge other than the current one
  let lastScreen = null // the window's place on the screen last frame, for shaking it
  const shakeDebt = [0, 0] // px the lava still owes the window's moves, paid out smoothly
  // Frames a second for the panel: a counter and one string a second, nothing else.
  let fpsFrames = 0
  let fpsSince = performance.now()
  function frame () {
    fpsFrames++
    if (performance.now() - fpsSince >= 1000) {
      const fps = fpsFrames * 1000 / (performance.now() - fpsSince)
      autoPixelsTick(fps)
      fpsLabel(`${Math.round(fps)} fps, Pixels ${Number(pixels()).toFixed(2)} M${autoPixels() ? ' (auto)' : ''}${Math.abs(pixels() - nativePixels()) < 0.005 ? ', 1:1' : ''}`)
      fpsFrames = 0
      fpsSince = performance.now()
    }
    // A shake is a shove, in the lamp's frame.
    const [ax, ay] = pageVectorToLamp(turns, ...motion.consume())
    sim.push(ax / FRAME * MOTION_GAIN, ay / FRAME * MOTION_GAIN)
    // Shaking the window shakes the lava, as a shake of the phone does (Robert: "could we make
    // shaking the window shake the lava like on mobile?"). The lava keeps its place in the world
    // by inertia, so a move of the window is owed to the lava the other way. Pushed all in the
    // frame it was seen it read as a glitch (Robert: "reads like a bug related to window position
    // rather than an intentional feature"): the browser reports a dragged window's position in
    // bursts, so the lava jumped. Now each move goes into a debt that is paid out smoothly over
    // about WINDOW_SHAKE_EASE seconds, so a burst becomes a slosh. Capped; moves of a pixel or two
    // are ignored.
    const wx = window.screenX
    const wy = window.screenY
    if (lastScreen) {
      const dx = wx - lastScreen[0]
      const dy = wy - lastScreen[1]
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        shakeDebt[0] -= dx * WINDOW_SHAKE_GAIN
        shakeDebt[1] -= dy * WINDOW_SHAKE_GAIN
        const owed = Math.hypot(shakeDebt[0], shakeDebt[1])
        if (owed > WINDOW_SHAKE_MAX) { shakeDebt[0] *= WINDOW_SHAKE_MAX / owed; shakeDebt[1] *= WINDOW_SHAKE_MAX / owed }
      }
    }
    lastScreen = [wx, wy]
    if (Math.abs(shakeDebt[0]) + Math.abs(shakeDebt[1]) > 0.05) {
      const share = 1 - Math.exp(-FRAME / WINDOW_SHAKE_EASE)
      const [lx, ly] = pageVectorToLamp(turns, shakeDebt[0] * share, shakeDebt[1] * share)
      sim.push(lx / FRAME, ly / FRAME)
      shakeDebt[0] -= shakeDebt[0] * share
      shakeDebt[1] -= shakeDebt[1] * share
    }
    // Gravity picks the floor.
    const wanted = motion.downEdge(edge)
    leaning = wanted === edge ? 0 : leaning + FRAME
    if (leaning >= TURN_DELAY) {
      leaning = 0
      turnTo(wanted)
    }
    // Fingers.
    const mode = touchMode()
    sim.setTouches(pointer.consume(FRAME).map(p => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, mode })))
    const t0 = profiling ? performance.now() : 0
    let count = 0
    if (sim.remote) {
      // The worker steps on its own clock; this frame hands over the inputs and draws between
      // the last two states it sent.
      sim.frame(pace() * tempoPace, overlayWants())
      count = sim.interpolate(shown, performance.now())
    } else {
      if (still) Object.assign(params, STILL)
      due += pace() * tempoPace
      while (due >= 1) {
        due -= 1
        remember()
        sim.step(FRAME)
        tally.steps++
      }
      const { x, y, id } = sim.state
      count = sim.count
      if (shown.x.length < count) { shown.x = new Float32Array(count); shown.y = new Float32Array(count) }
      for (let i = 0; i < count; i++) {
        const b = id ? id[i] : i
        if (b >= previous.x.length || previous.stamp[b] !== previous.tick) { shown.x[i] = x[i]; shown.y[i] = y[i]; continue } // born since
        shown.x[i] = previous.x[b] + (x[i] - previous.x[b]) * due
        shown.y[i] = previous.y[b] + (y[i] - previous.y[b]) * due
      }
      shown.temp = sim.state.temp
    }
    const t1 = profiling ? performance.now() : 0
    // The Cups view: fit everything from the top of the highest cup to the bottom of the deepest
    // into the frame, scaled down and centred, so the hidden lava can be watched.
    let view = null
    if (showCups()) {
      let minY = 0
      let maxY = height
      for (let px = 0; px <= width; px += 8) {
        minY = Math.min(minY, sim.ceilingAt(px))
        maxY = Math.max(maxY, sim.floorAt(px))
      }
      const k = Math.min(1, height / (maxY - minY))
      // With the Heater view on as well, the floor bottles are drawn in their element's heat colour.
      const glow = showHeater() ? sim.heaterElements().map(el => el.glow) : null
      view = { k, ox: (width - width * k) / 2, oy: -minY * k, ceilingAt: sim.ceilingAt, floorAt: sim.floorAt, bottles: sim.bottles(), floorBottles: sim.floorBottles(), glow, look }
    }
    shownView = view
    renderer.render(shown, count, { flowAt: sim.flowAt, heaterAt: sim.heaterAt, elements: sim.heaterElements, neutral: params.gravity, floorY: sim.height, view })
    if (gloop.enabled) gloop.update(sim.state, sim.count, width, height, params.gravity, FRAME * pace(), params.interactionRadius)
    // Real time for the music, not the lamp's fixed step: at 120 Hz FRAME ran its clock at
    // double speed and a 120 bpm song read as 62.
    const musicNow = performance.now()
    driveMusic(Math.min(0.1, Math.max(0.001, (musicNow - lastMusicAt) / 1000)))
    lastMusicAt = musicNow
    if (profiling) {
      const t2 = performance.now()
      tally.frames++
      tally.sim += t1 - t0
      tally.render += t2 - t1
      tally.span += t2 - tally.last
      tally.last = t2
      for (const k in renderer.profile) tally.phases[k] = (tally.phases[k] || 0) + renderer.profile[k]
      if (tally.span >= 2000) report()
    }
    requestAnimationFrame(frame)
  }

  frame()
}
