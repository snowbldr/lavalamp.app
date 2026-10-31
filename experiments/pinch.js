// The pinch lab: one blob, one heat pulse, nothing random, drawn as a black silhouette on orange
// like the video Robert found of a real lamp (youtube 27ccYiw9RBs). Robert: "could we make a
// single simulation version that was not random and reproduced that snap in the video? That'd
// inform us on the properties of the liquid we need to get it right". Knobs for the liquid,
// Replay, and a filmstrip of frames at a fixed interval after the pulse, to lay beside the stills.
import { button, div, fnstate, span } from '@srfnstack/fntags'
import { createSimulation } from '../src/sim/simulation.js'
import { seedRandom } from '../src/sim/random.js'
import { createRenderer } from '../src/render/renderer.js'
import { hint, knob, knobs, row, segmented, toggle } from '../src/ui/components.js'
import { defaultHeatColors } from '../src/ui/settings.js'

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
  // Half the lamp's grain, at Robert's suggestion: "maybe we need a smaller particle size? that
  // should be fine now that we have a much faster render". Same lava, four times the particles.
  const radius = fnstate(30)
  const settle = fnstate(2) // relaxation passes a frame
  const viscosity = fnstate(0) // the paper's sigma; set after the sweep
  const size = fnstate(15)
  const smooth = fnstate(8) // edge smoothing radius, px
  // The experiment. Robert, on the first strip: "the blob go too hot and stuck to the ceiling and
  // had too much momentum taking off from the initial heating. maybe warm the whole bottom first,
  // then gently pulse the heat until it takes off". So: the lamp's own floor heater runs for Warm
  // seconds, then a finger on the floor's middle pulses for Pulse seconds every Gap seconds at Heat,
  // and Max heat caps the temperature (rise speed is temperature minus gravity, 500).
  const count = fnstate(640)
  const warm = fnstate(6) // seconds of whole-floor heating before the pulses
  const pulse = fnstate(0.6) // seconds of finger heat per pulse
  const gap = fnstate(1.5) // seconds between pulses
  const heat = fnstate(20) // finger heat per step
  const maxHeat = fnstate(800)
  const interval = fnstate(0.6) // seconds between filmstrip frames
  const frames = fnstate(12)
  const from = fnstate(14) // the filmstrip starts itself at this time after a Replay
  const slow = fnstate(false)
  // Silhouette is black on orange like the video, Lamp the lamp's own colours and lighting, Heat the heat map.
  const view = fnstate('silhouette')
  const help = fnstate(false)

  const canvas = document.createElement('canvas')
  const lamp = div({ class: 'lamp' }, canvas)
  const strip = div({ class: 'strip' })
  const clock = span({ class: 'readout' }, '')

  const look = { lavaColor: { r: 10, g: 5, b: 5 }, highlightColor: { r: 60, g: 20, b: 10 }, particleSize: size(), showFlow: false, showHeat: false, showHeater: false, ...defaultHeatColors }
  const renderer = createRenderer(canvas, look)
  renderer.resize(W, H)
  const dress = () => {
    look.showHeat = view() === 'heat'
    look.smooth = smooth()
    if (view() === 'silhouette') {
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
      maxTemp: maxHeat(), gravity: 500, particleSize: size(), stir: 0, conduction: gloop(), turbulence: 0, drifters: 0, heatSpots: 0, cupDepth: 0,
      wobble: wobble(), wobbleKick: kick(), wobbleMax: cap(), heater: time < warm(), touchHeat: heat(), settle: settle(), viscosity: viscosity()
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
      // After the warm floor, a heat finger on the floor's middle pulses: on for Pulse, off for Gap.
      const since = time - warm()
      const on = since >= 0 && since % (pulse() + gap()) < pulse()
      sim.setTouches(on ? [{ x: W / 2, y: H - 30, vx: 0, vy: 0, mode: 'heat' }] : [])
      Object.assign(live, params()) // the knobs apply live; the simulation reads this object
      sim.step(FRAME)
      time += FRAME
    }
    renderer.render(sim.state, sim.count, { neutral: 500 }) // neutral buoyancy is the gravity, 500
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
    button({ class: help.bindAttr(() => help() ? 'panel-close panel-help on' : 'panel-close panel-help'), onclick: () => help(!help()), title: 'What the knobs do' }, '?'),
    div({ class: 'panel-section' }, div({ class: 'panel-section-title plain' }, span('Liquid')),
      knobs(
        knob('Wobble', 'wobble', wobble, { min: 0, max: 1, step: 0.02 }, () => 0.3, v => `${v} s`),
        knob('Kick', 'kick', kick, { min: 0, max: 3, step: 0.1 }, () => 1),
        knob('Cap', 'cap', cap, { min: 0.5, max: 5, step: 0.1 }, () => 2, v => `${v} g`),
        knob('Gloop', 'gloop', gloop, { min: 0, max: 0.04, step: 0.0005 }, () => 0.02, v => Number(v).toFixed(4))
      ),
      hint(help, [
        ['Wobble', 'inertia: seconds for a particle to ease onto its drift. 0 is the overdamped wax with no snap at all.'],
        ['Kick', 'how much of the surface tension pull on a stretched neck or a blob skin is carried on as velocity.'],
        ['Cap', 'the fastest that carried velocity may get, in gravities.'],
        ['Gloop', 'heat conduction between touching particles: high is lava that warms and lifts as one piece.']
      ]),
      knobs(
        knob('Stiff', 'stiff', stiffness, { min: 1, max: 6500, step: 1 }, () => 4000),
        knob('Near', 'near', near, { min: 1, max: 40000, step: 10 }, () => 25000),
        knob('Density', 'density', density, { min: 0.01, max: 7, step: 0.01 }, () => 4.25, v => Number(v).toFixed(2)),
        knob('Radius', 'radius', radius, { min: 15, max: 100, step: 1 }, () => 30)
      ),
      knobs(
        knob('Settle', 'settle', settle, { min: 1, max: 3, step: 1 }, () => 2),
        knob('Viscosity', 'viscosity', viscosity, { min: 0, max: 60, step: 1 }, () => 0)
      ),
      hint(help, [
        ['Stiff', 'pressure pushing particles apart when they crowd past the rest density.'],
        ['Near', 'the short range push that stops particles stacking; also the surface tension.'],
        ['Density', 'the rest density the pressure aims for: lower is a looser, more stretchy liquid.'],
        ['Radius', 'how far a particle feels its neighbours, in pixels.'],
        ['Settle', 'pressure passes per frame. 1 is the lamp; 2 spaces the particles more evenly so the skin is less bumpy to begin with.']
      ])),
    div({ class: 'panel-section' }, div({ class: 'panel-section-title plain' }, span('Experiment')),
      knobs(
        knob('Lava', 'count', count, { min: 50, max: 1200, step: 10 }, () => 640),
        knob('Warm', 'warm', warm, { min: 0, max: 20, step: 0.5 }, () => 6, v => `${v} s`),
        knob('Pulse', 'pulse', pulse, { min: 0.1, max: 4, step: 0.1 }, () => 0.6, v => `${v} s`),
        knob('Gap', 'gap', gap, { min: 0.1, max: 6, step: 0.1 }, () => 1.5, v => `${v} s`)
      ),
      hint(help, [
        ['Lava', 'particles in the pool. The blob is cut from these, so more lava is a bigger blob or a second one.'],
        ['Warm', 'seconds the whole floor heats like a real lamp base before any pulse, so the pool starts warm and soft.'],
        ['Pulse', 'seconds each heat pulse lasts: a finger on Heat held at the middle of the floor.'],
        ['Gap', 'seconds between pulses. They repeat until you Replay, so a blob keeps coming.']
      ]),
      knobs(
        knob('Heat', 'heat', heat, { min: 1, max: 30, step: 1 }, () => 20),
        knob('Max heat', 'maxHeat', maxHeat, { min: 500, max: 2000, step: 10 }, () => 800),
        knob('Size', 'size', size, { min: 5, max: 50, step: 1 }, () => 15),
        knob('Smooth', 'smooth', smooth, { min: 0, max: 24, step: 1 }, () => 8)
      ),
      hint(help, [
        ['Heat', 'how hard each pulse heats: temperature added per frame under the finger. 12 is the lamp\'s touch.'],
        ['Max heat', 'the hottest lava can get. Rise speed is heat minus gravity (500), so 800 is a blob that climbs at 300 px/s at most and cools before the ceiling.'],
        ['Size', 'the drawn radius of a particle, in pixels. Mostly the look; it also sets how close to the floor counts as touching the heater. For finer lava, halve Size and Radius and use four times the Lava.'],
        ['Smooth', 'edge smoothing: the lava field is blurred by this many pixels before the edge is cut, which rounds off the bumps of the particles. 0 is the raw metaballs.']
      ]),
      knobs(
        knob('From', 'from', from, { min: 0, max: 30, step: 0.5 }, () => 14, v => `${v} s`),
        knob('Every', 'interval', interval, { min: 0.1, max: 2, step: 0.1 }, () => 0.6, v => `${v} s`),
        knob('Frames', 'frames', frames, { min: 4, max: 24, step: 1 }, () => 12)
      ),
      hint(help, [
        ['From', 'the filmstrip starts itself this many seconds after a Replay.'],
        ['Every', 'seconds between filmstrip frames.'],
        ['Frames', 'how many frames the strip takes before it stops.']
      ]),
      row('View', segmented('view', view, ['silhouette', 'lamp', 'heat'])),
      row('Slow motion', toggle('slow', slow)),
      hint(help, 'Slow motion runs the lab at a quarter speed. View: silhouette is black lava on the video\'s orange for shape, lamp is the lamp\'s own colours and lighting, heat is the heat map (blue sinking, red rising).')),
    div({ class: 'actions' },
      button({ id: 'replay', onclick: reset }, 'Replay'),
      button({ id: 'film', class: 'primary', onclick: film }, 'Filmstrip now'),
      clock)
  )

  document.body.append(div({ class: 'lab' }, lamp, strip), panel)
  reset()
  frame()
}
