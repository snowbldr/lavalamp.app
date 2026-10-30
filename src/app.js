import { a, canvas, div, sub } from '@srfnstack/fntags'
import { createSimulation } from './sim/simulation.js'
import { createCanvasRenderer } from './render/canvasRenderer.js'
import { createMotionInput } from './input/motion.js'
import { notify } from './ui/components.js'
import { createSettingsPanel } from './ui/settingsPanel.js'
import {
  bgColor,
  computeDefaultGravity,
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
  particleCount,
  particleSize,
  restDensity,
  stiffness,
  stiffnessNear,
  stir
} from './ui/settings.js'

// The lamp never grows past this in either direction; the simulation was tuned at this size.
const MAX_SIZE = 1000
// Fixed step. The sim does not track real frame time, and the tuning assumes it does not.
const FRAME = 1 / 60
// How hard a bump to the device shoves the lava.
const MOTION_GAIN = 2

const lampSize = () => [Math.min(window.innerWidth, MAX_SIZE), Math.min(window.innerHeight, MAX_SIZE)]

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

  const look = {}
  mirror(lavaColor, look, 'lavaColor')
  mirror(highlightColor, look, 'highlightColor')
  mirror(particleSize, look, 'particleSize')

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

  function frame () {
    const [ax, ay] = motion.consume()
    sim.push(ax / FRAME * MOTION_GAIN, ay / FRAME * MOTION_GAIN)
    sim.step(FRAME)
    renderer.render(sim.state, sim.count)
    requestAnimationFrame(frame)
  }

  frame()
}
