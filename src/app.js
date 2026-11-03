import { a, canvas, div, sub } from '@srfnstack/fntags'
import { createSimulation } from './sim/simulation.js'
import { createGpuLamp, getGpuDevice } from './sim/gpuSimulation.js'
import { createWorkerLamp } from './sim/workerLamp.js'
import { FLOW_SPACING, HEATER_CELL } from './render/overlays.js'
import { createRenderer } from './render/renderer.js'
import { createMotionInput } from './input/motion.js'
import { createPointerInput } from './input/pointer.js'
import { createGloop } from './audio/gloop.js'
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
  showHeater,
  settle,
  smooth,
  blend,
  stiffnessNear,
  stir,
  touchMode,
  touchStrength,
  turbulence,
  viscosity,
  seed
} from './ui/settings.js'

// Fixed step. The sim does not track real frame time, and the tuning assumes it does not.
const FRAME = 1 / 60
// How hard a bump to the device shoves the lava.
const MOTION_GAIN = 2
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
  if (profiling) window.lavalamp = { sim, params, look, gloop, device } // for timing the running lamp from the console
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
      sim.frame(pace(), overlayWants())
      count = sim.interpolate(shown, performance.now())
    } else {
      if (still) Object.assign(params, STILL)
      due += pace()
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
    renderer.render(shown, count, { flowAt: sim.flowAt, heaterAt: sim.heaterAt, elements: sim.heaterElements, neutral: params.gravity, view })
    if (gloop.enabled) gloop.update(sim.state, sim.count, width, height, params.gravity, FRAME * pace(), params.interactionRadius)
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
