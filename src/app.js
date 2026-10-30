import { a, canvas, div, sub } from '@srfnstack/fntags'
import { createSimulation } from './sim/simulation.js'
import { createCanvasRenderer } from './render/canvasRenderer.js'
import { createMotionInput } from './input/motion.js'
import { createPointerInput } from './input/pointer.js'
import { TURNS, lampSizeFor, lampToPage, pageToLamp, pageVectorToLamp } from './input/frame.js'
import { notify } from './ui/components.js'
import { createSettingsPanel } from './ui/settingsPanel.js'
import {
  bgColor,
  computeDefaultGravity,
  conduction,
  drifters,
  computeDefaultMaxTemp,
  computeDefaultParticleCount,
  defaultGravityStrength,
  defaultMaxTemp,
  defaultParticleCount,
  gravityStrength,
  rodHeight,
  rodSpacing,
  heatSpots,
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
  mirror(rodHeight, params, 'rodHeight')
  mirror(rodSpacing, params, 'rodSpacing')

  const look = {}
  mirror(lavaColor, look, 'lavaColor')
  mirror(highlightColor, look, 'highlightColor')
  mirror(particleSize, look, 'particleSize')
  mirror(showFlow, look, 'showFlow')
  mirror(showHeat, look, 'showHeat')

  let previous = { x: new Float32Array(0), y: new Float32Array(0) } // last sim positions, for the pace interpolation
  let edge = 'bottom' // the page edge the lamp's floor sits on
  let turns = TURNS[edge]
  let [pageWidth, pageHeight] = pageSize()
  let [width, height] = lampSizeFor(turns, pageWidth, pageHeight)
  const lamp = canvas({ id: 'lavalamp', style: { transition: 'transform 0.4s' } })
  const sim = createSimulation({ width, height, params })
  const renderer = createCanvasRenderer(lamp, look)
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
      a({ target: '_blank', href: 'https://github.com/snowbldr/lavalamp.app' }, 'Copyright © 2020 Robert Kempton')
    )
  )

  // Pace is slow motion, not a smaller step: the sim always steps by FRAME, which every tuned
  // number assumes, but only on `pace` of the frames, and the drawing interpolates between the
  // last two sim states so it stays smooth. At pace 1 it steps and draws every frame as before.
  const shown = { x: new Float32Array(0), y: new Float32Array(0), temp: null }
  let due = 1
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
    while (due >= 1) {
      due -= 1
      previous = { x: sim.state.x.slice(0, sim.count), y: sim.state.y.slice(0, sim.count) }
      sim.step(FRAME)
    }
    const { x, y } = sim.state
    const count = Math.min(sim.count, previous.x.length)
    if (shown.x.length < count) { shown.x = new Float32Array(count); shown.y = new Float32Array(count) }
    for (let i = 0; i < count; i++) {
      shown.x[i] = previous.x[i] + (x[i] - previous.x[i]) * due
      shown.y[i] = previous.y[i] + (y[i] - previous.y[i]) * due
    }
    shown.temp = sim.state.temp
    renderer.render(shown, count, { flowAt: sim.flowAt, heaterAt: sim.heaterAt, rods: sim.heaterRods, neutral: params.gravity })
    requestAnimationFrame(frame)
  }

  frame()
}
