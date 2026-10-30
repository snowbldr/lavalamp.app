// The pinch lab: one blob, one heat pulse, nothing random, drawn as a black silhouette on orange
// like the video Robert found of a real lamp (youtube 27ccYiw9RBs). Robert: "could we make a
// single simulation version that was not random and reproduced that snap in the video? That'd
// inform us on the properties of the liquid we need to get it right". Knobs for the liquid,
// Replay, and a filmstrip of frames at a fixed interval after the pulse, to lay beside the stills.
import { button, div, fnstate, span } from '@srfnstack/fntags'
import { createSimulation } from '../src/sim/simulation.js'
import { seedRandom } from '../src/sim/random.js'
import { createRenderer } from '../src/render/renderer.js'
import { knob, knobs, pair, toggle } from '../src/ui/components.js'

const W = 360
const H = 900
const FRAME = 1 / 60
const SEED = 1

export function start () {
  // The liquid.
  const wobble = fnstate(0.3)
  const kick = fnstate(1)
  const cap = fnstate(2)
  const stiffness = fnstate(4000)
  const near = fnstate(25000)
  const density = fnstate(4.25)
  const gloop = fnstate(0.02)
  const radius = fnstate(60)
  const size = fnstate(30)
  // The experiment.
  const count = fnstate(160)
  const pulse = fnstate(2) // seconds of finger heat
  const heat = fnstate(12) // finger heat per step
  const interval = fnstate(0.6) // seconds between filmstrip frames
  const frames = fnstate(12)
  const from = fnstate(3) // the filmstrip starts itself at this time after a Replay
  const slow = fnstate(false)
  const silhouette = fnstate(true) // black on orange like the video, or the lamp's own colours and lighting

  const canvas = document.createElement('canvas')
  const lamp = div({ class: 'lamp' }, canvas)
  const strip = div({ class: 'strip' })
  const clock = span({ class: 'readout' }, '')

  const look = { lavaColor: { r: 10, g: 5, b: 5 }, highlightColor: { r: 60, g: 20, b: 10 }, particleSize: size(), showFlow: false, showHeat: false, showHeater: false }
  const renderer = createRenderer(canvas, look)
  renderer.resize(W, H)
  const dress = () => {
    if (silhouette()) {
      look.lavaColor = { r: 10, g: 5, b: 5 }
      look.highlightColor = { r: 60, g: 20, b: 10 }
      lamp.style.background = '#e8420a'
    } else {
      look.lavaColor = { r: 133, g: 0, b: 204 }
      look.highlightColor = { r: 182, g: 124, b: 254 }
      lamp.style.background = '#000'
    }
    for (const shot of strip.querySelectorAll('canvas')) shot.style.background = lamp.style.background
  }

  let live = null
  let sim = null
  let time = 0
  let lastReal = performance.now()
  let owed = 0 // simulation time owed to real time
  let captured = 0
  let nextCapture = Infinity
  let capturing = false

  function params () {
    return {
      particleCount: count(), interactionRadius: radius(), stiffness: stiffness(), stiffnessNear: near(), restDensity: density(),
      maxTemp: 2000, gravity: 500, particleSize: size(), stir: 0, conduction: gloop(), turbulence: 0, drifters: 0, heatSpots: 1e9, cupDepth: 0,
      wobble: wobble(), wobbleKick: kick(), wobbleMax: cap(), heater: false, touchHeat: heat()
    }
  }

  function reset () {
    seedRandom(SEED)
    live = params()
    sim = createSimulation({ width: W, height: H, params: live })
    time = 0
    captured = 0
    capturing = true
    nextCapture = from()
    owed = 0
    lastReal = performance.now()
    strip.replaceChildren()
  }

  function film () {
    strip.replaceChildren()
    captured = 0
    capturing = true
    nextCapture = time
  }

  function frame () {
    look.particleSize = size()
    dress()
    // Step by real time (a 120 Hz display otherwise runs the lab at double speed), a quarter of it
    // in slow motion, in whole frames.
    const nowReal = performance.now()
    owed += Math.min(0.1, (nowReal - lastReal) / 1000) * (slow() ? 0.25 : 1)
    lastReal = nowReal
    let steps = 0
    while (owed >= FRAME && steps < 4) { owed -= FRAME; steps++ }
    for (let k = 0; k < steps; k++) {
      // The pulse: a heat finger on the floor's middle from 1 s to 1 s + pulse.
      const on = time >= 1 && time < 1 + pulse()
      sim.setTouches(on ? [{ x: W / 2, y: H - 30, vx: 0, vy: 0, mode: 'heat' }] : [])
      Object.assign(live, params()) // the knobs apply live; the simulation reads this object
      sim.step(FRAME)
      time += FRAME
    }
    renderer.render(sim.state, sim.count, { neutral: 500 })
    if (capturing && time >= nextCapture) {
      const shot = document.createElement('canvas')
      shot.width = W / 3
      shot.height = H / 3
      shot.getContext('2d').drawImage(canvas, 0, 0, shot.width, shot.height)
      strip.append(div({ style: { textAlign: 'center', fontSize: '11px' } }, shot, div(`${time.toFixed(1)} s`)))
      captured++
      nextCapture = time + interval()
      if (captured >= frames()) capturing = false
    }
    clock.textContent = `${time.toFixed(1)} s`
    requestAnimationFrame(frame)
  }

  const panel = div(
    { class: 'panel' },
    div({ class: 'panel-section' }, div({ class: 'panel-section-title plain' }, span('Liquid')),
      knobs(
        knob('Wobble', 'wobble', wobble, { min: 0, max: 1, step: 0.02 }, () => 0.3, v => `${v} s`),
        knob('Kick', 'kick', kick, { min: 0, max: 3, step: 0.1 }, () => 1),
        knob('Cap', 'cap', cap, { min: 0.5, max: 5, step: 0.1 }, () => 2, v => `${v} g`),
        knob('Gloop', 'gloop', gloop, { min: 0, max: 0.04, step: 0.0005 }, () => 0.02, v => Number(v).toFixed(4))
      ),
      knobs(
        knob('Stiff', 'stiff', stiffness, { min: 1, max: 6500, step: 1 }, () => 4000),
        knob('Near', 'near', near, { min: 1, max: 40000, step: 10 }, () => 25000),
        knob('Density', 'density', density, { min: 0.01, max: 7, step: 0.01 }, () => 4.25, v => Number(v).toFixed(2)),
        knob('Radius', 'radius', radius, { min: 30, max: 100, step: 1 }, () => 60)
      )),
    div({ class: 'panel-section' }, div({ class: 'panel-section-title plain' }, span('Experiment')),
      knobs(
        knob('Lava', 'count', count, { min: 50, max: 600, step: 10 }, () => 160),
        knob('Pulse', 'pulse', pulse, { min: 0.5, max: 8, step: 0.1 }, () => 2, v => `${v} s`),
        knob('Heat', 'heat', heat, { min: 2, max: 30, step: 1 }, () => 12),
        knob('Size', 'size', size, { min: 5, max: 50, step: 1 }, () => 30)
      ),
      knobs(
        knob('From', 'from', from, { min: 0, max: 20, step: 0.5 }, () => 3, v => `${v} s`),
        knob('Every', 'interval', interval, { min: 0.1, max: 2, step: 0.1 }, () => 0.6, v => `${v} s`),
        knob('Frames', 'frames', frames, { min: 4, max: 24, step: 1 }, () => 12)
      ),
      pair('Slow motion', toggle('slow', slow), 'Silhouette', toggle('silhouette', silhouette))),
    div({ class: 'actions' },
      button({ id: 'replay', onclick: reset }, 'Replay'),
      button({ id: 'film', class: 'primary', onclick: film }, 'Filmstrip now'),
      clock)
  )

  document.body.append(div({ class: 'lab' }, lamp, strip), panel)
  reset()
  frame()
}
