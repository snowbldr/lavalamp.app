import { a, canvas, div, sub } from '@srfnstack/fntags'
import { createSimulation } from './sim/simulation.js'
import { createRenderer } from './render/renderer.js'
import { createMotionInput } from './input/motion.js'
import { createPointerInput } from './input/pointer.js'
import { TURNS, lampSizeFor, lampToPage, pageToLamp, pageVectorToLamp } from './input/frame.js'
import { notify } from './ui/components.js'
import { createSettingsPanel } from './ui/settingsPanel.js'
import {
  bgColor,
  computeDefaultGravity,
  conduction,
  cupDepth,
  drifters,
  computeDefaultMaxTemp,
  computeDefaultParticleCount,
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
  highlightColor,
  interactionRadius,
  lavaColor,
  loadSavedSettings,
  maxTemp,
  pace,
  particleCount,
  particleSize,
  restDensity,
  showFlow,
  showHeat,
  showHeater,
  stiffness,
  stiffnessNear,
  stir,
  touchMode,
  turbulence
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

export function start () {
  loadSavedSettings()

  const params = {}
  mirror(particleCount, params, 'particleCount', Math.trunc)
  mirror(interactionRadius, params, 'interactionRadius')
  mirror(stiffness, params, 'stiffness')
  mirror(stiffnessNear, params, 'stiffnessNear')
  mirror(restDensity, params, 'restDensity')
  mirror(maxTemp, params, 'maxTemp')
  mirror(gravityStrength, params, 'gravity')
  mirror(particleSize, params, 'particleSize')
  mirror(stir, params, 'stir')
  mirror(conduction, params, 'conduction')
  mirror(turbulence, params, 'turbulence')
  mirror(drifters, params, 'drifters')
  mirror(heatSpots, params, 'heatSpots')
  mirror(cupDepth, params, 'cupDepth')

  const look = {}
  mirror(lavaColor, look, 'lavaColor')
  mirror(highlightColor, look, 'highlightColor')
  mirror(heatCold, look, 'heatCold')
  mirror(heatCool, look, 'heatCool')
  mirror(heatWarm, look, 'heatWarm')
  mirror(heatHot, look, 'heatHot')
  mirror(heatPeak, look, 'heatPeak')
  mirror(flowSlow, look, 'flowSlow')
  mirror(flowFast, look, 'flowFast')
  mirror(particleSize, look, 'particleSize')
  mirror(showFlow, look, 'showFlow')
  mirror(showHeat, look, 'showHeat')
  mirror(showHeater, look, 'showHeater')

  let previous = { x: new Float32Array(0), y: new Float32Array(0) } // last sim positions, for the pace interpolation
  let edge = 'bottom' // the page edge the lamp's floor sits on
  let turns = TURNS[edge]
  let [pageWidth, pageHeight] = pageSize()
  let [width, height] = lampSizeFor(turns, pageWidth, pageHeight)
  const lamp = canvas({ id: 'lavalamp', style: { transition: 'transform 0.4s' } })
  const sim = createSimulation({ width, height, params })
  const renderer = createRenderer(lamp, look)
  const motion = createMotionInput()
  const toLamp = (px, py) => pageToLamp(turns, pageWidth, pageHeight, width, height, px, py)
  const pointer = createPointerInput(lamp, toLamp)
  const settingsPanel = createSettingsPanel()

  // Size the lamp to the page for the current turn, and keep the window-following defaults honest.
  function fit () {
    [pageWidth, pageHeight] = pageSize();
    [width, height] = lampSizeFor(turns, pageWidth, pageHeight)
    sim.resize(width, height)
    renderer.resize(width, height)
    lamp.style.transform = `rotate(${turns * 90}deg)`
    followWindow(defaultParticleCount, particleCount, computeDefaultParticleCount(width, height))
    followWindow(defaultMaxTemp, maxTemp, computeDefaultMaxTemp(height))
    followWindow(defaultGravityStrength, gravityStrength, computeDefaultGravity(height))
  }
  fit()
  window.addEventListener('resize', fit)

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
    previous = { x: sim.state.x.slice(0, sim.count), y: sim.state.y.slice(0, sim.count) }
  }

  // Browsers only allow the wake lock and the motion sensors from inside a user gesture.
  const onFirstClick = () => {
    document.removeEventListener('click', onFirstClick)
    if (typeof NoSleep !== 'undefined') {
      new NoSleep().enable()
      notify('Wake Lock Activated')
    }
    motion.requestPermission()
  }
  document.addEventListener('click', onFirstClick)

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
          'z-index': 200
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
  const tally = { frames: 0, sim: 0, steps: 0, render: 0, span: 0, last: performance.now(), phases: {} }
  const report = () => {
    const out = {
      fps: (tally.frames / (tally.span / 1000)).toFixed(1),
      frameMs: (tally.span / tally.frames).toFixed(2),
      simMs: (tally.sim / tally.frames).toFixed(2),
      stepsPerFrame: (tally.steps / tally.frames).toFixed(2),
      renderMs: (tally.render / tally.frames).toFixed(2),
      pixels: renderer.pixels(),
      particles: sim.count,
      renderer: renderer.kind || 'canvas'
    }
    for (const k in tally.phases) out[k] = (tally.phases[k] / tally.frames).toFixed(2)
    window.lavaProfile = out
    console.log('[profile]', JSON.stringify(out))
    tally.frames = 0; tally.sim = 0; tally.steps = 0; tally.render = 0; tally.span = 0; tally.phases = {}
  }
  let leaning = 0 // seconds gravity has pointed at an edge other than the current one
  function frame () {
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
    due += pace()
    const t0 = profiling ? performance.now() : 0
    while (due >= 1) {
      due -= 1
      // Keep the last positions for the interpolation, copying into a reused buffer.
      if (previous.x.length !== sim.count) previous = { x: new Float32Array(sim.count), y: new Float32Array(sim.count) }
      previous.x.set(sim.state.x.subarray(0, sim.count))
      previous.y.set(sim.state.y.subarray(0, sim.count))
      sim.step(FRAME)
      tally.steps++
    }
    const t1 = profiling ? performance.now() : 0
    const { x, y } = sim.state
    const count = Math.min(sim.count, previous.x.length)
    if (shown.x.length < count) { shown.x = new Float32Array(count); shown.y = new Float32Array(count) }
    for (let i = 0; i < count; i++) {
      shown.x[i] = previous.x[i] + (x[i] - previous.x[i]) * due
      shown.y[i] = previous.y[i] + (y[i] - previous.y[i]) * due
    }
    shown.temp = sim.state.temp
    renderer.render(shown, count, { flowAt: sim.flowAt, heaterAt: sim.heaterAt, elements: sim.heaterElements, neutral: params.gravity })
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
