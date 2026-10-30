import { a, canvas, div, sub } from '@srfnstack/fntags'
import { createSimulation } from './sim/simulation.js'
import { createCanvasRenderer } from './render/canvasRenderer.js'
import { createMotionInput } from './input/motion.js'
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
  stiffness,
  stiffnessNear,
  stir,
  turbulence
} from './ui/settings.js'

// Fixed step. The sim does not track real frame time, and the tuning assumes it does not.
const FRAME = 1 / 60
// How hard a bump to the device shoves the lava.
const MOTION_GAIN = 2

// The lamp is the whole window. It used to stop at 1000 px each way to keep the per pixel metaball
// pass affordable; the performance work since made that unnecessary.
const lampSize = () => [window.innerWidth, window.innerHeight]

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

  const look = {}
  mirror(lavaColor, look, 'lavaColor')
  mirror(highlightColor, look, 'highlightColor')
  mirror(particleSize, look, 'particleSize')
  mirror(showFlow, look, 'showFlow')

  let [width, height] = lampSize()
  const lamp = canvas({ id: 'lavalamp' })
  const sim = createSimulation({ width, height, params })
  const renderer = createCanvasRenderer(lamp, look)
  renderer.resize(width, height)
  const motion = createMotionInput()
  const settingsPanel = createSettingsPanel()

  window.addEventListener('resize', () => {
    [width, height] = lampSize()
    sim.resize(width, height)
    renderer.resize(width, height)
    followWindow(defaultParticleCount, particleCount, computeDefaultParticleCount(window.innerWidth, window.innerHeight))
    followWindow(defaultMaxTemp, maxTemp, computeDefaultMaxTemp(window.innerHeight))
    followWindow(defaultGravityStrength, gravityStrength, computeDefaultGravity(window.innerHeight))
  })

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
  const shown = { x: new Float32Array(0), y: new Float32Array(0) }
  let previous = { x: new Float32Array(0), y: new Float32Array(0) }
  let due = 1
  function frame () {
    const [ax, ay] = motion.consume()
    sim.push(ax / FRAME * MOTION_GAIN, ay / FRAME * MOTION_GAIN)
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
    renderer.render(shown, count, sim.flowAt)
    requestAnimationFrame(frame)
  }

  frame()
}
