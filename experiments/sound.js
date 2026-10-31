// The sound board: the lamp running beside every number the sound is made of, so the gloops can
// be tuned by ear while the lava does its thing (Robert: "How about we create a little sound
// board experiment for playing with the sounds along with the lava"). Buttons play each voice by
// hand, a readout counts what the lava fired, Copy settings gives the tune as one line of JSON
// to paste back, and the last tune is kept in this browser.
import { button, div, fnstate, span } from '@srfnstack/fntags'
import { createGpuLamp, getGpuDevice } from '../src/sim/gpuSimulation.js'
import { createSimulation } from '../src/sim/simulation.js'
import { seedRandom } from '../src/sim/random.js'
import { createRenderer } from '../src/render/renderer.js'
import { createPointerInput } from '../src/input/pointer.js'
import { BEDS, TUNE, createGloop } from '../src/audio/gloop.js'
import { DECADES, hint, knob, knobs, row, segmented, toggle } from '../src/ui/components.js'
import {
  GPU_PARTICLES, GPU_REACH, setParticleBudget,
  computeDefaultParticleCount, computeDefaultInteractionRadius, computeDefaultParticleSize, computeDefaultSmooth, computeDefaultBlend,
  computeDefaultStiffness, computeDefaultStiffnessNear, computeDefaultMaxTemp, computeDefaultGravity,
  defaultRestDensity, defaultStir, defaultConduction, defaultPace, defaultTurbulence, defaultDrifters, defaultHeatSpots, defaultCupDepth,
  defaultWobble, defaultWobbleKick, defaultWobbleMax, defaultSettle, defaultViscosity, defaultSkin, defaultWall,
  defaultElementHeat, defaultElementLife, defaultElementRate, defaultElementLifeScale, defaultElementCore, defaultFloorHeat, defaultFloorGlow,
  defaultLavaColor, defaultLavaHighlight, defaultHeatColors, defaultFlowSlow, defaultFlowFast
} from '../src/ui/settings.js'

const W = 600
const H = 900
const FRAME = 1 / 60
const SEED = 7
const STORE = 'sound-board'

// The knobs: every number in TUNE with a range, grouped as the panel shows them.
const KNOBS = {
  Lamp: [
    ['master', 'Volume', 0, 1, 0.01, 2],
    ['agitationGain', 'Stir gain', 0.5, 10, 0.1, 1],
    ['fast', 'Fast', 0.05, 3, 0.05, 2],
    ['burst', 'Burst', 0.0001, 0.01, 0.0001, 4],
    ['cooldown', 'Cooldown', 0.02, 1, 0.01, 2]
  ],
  Bloop: [
    ['bloopLevel', 'Level', 0, 1, 0.01, 2],
    ['bloopLow', 'Low Hz', 20, 200, 1, 0],
    ['bloopSpan', 'Span Hz', 0, 800, 5, 0],
    ['bloopSlow', 'Slow', 0.3, 4, 0.1, 1],
    ['bloopSplash', 'Splash', 0, 1, 0.05, 2]
  ],
  Simmer: [
    ['simmerRateLow', 'Rate rest', 0, 10, 0.1, 1],
    ['simmerRateHigh', 'Rate stir', 0, 60, 1, 0],
    ['simmerLevel', 'Level', 0, 0.5, 0.01, 2],
    ['simmerSpeed', 'Speed', 0.5, 5, 0.1, 1]
  ],
  Glug: [
    ['glugRateLow', 'Rate rest', 0, 5, 0.1, 1],
    ['glugRateHigh', 'Rate stir', 0, 20, 0.5, 1],
    ['glugLevel', 'Level', 0, 1, 0.01, 2],
    ['glugLow', 'Low Hz', 20, 150, 1, 0],
    ['glugSpan', 'Span Hz', 0, 400, 5, 0],
    ['glugSlow', 'Slow', 0.3, 4, 0.1, 1],
    ['glugBreath', 'Breath', 0, 1, 0.05, 2]
  ],
  Beds: [
    ['noiseLevel', 'Noise', 0, 0.6, 0.01, 2],
    ['humLevel', 'Hum', 0, 0.6, 0.01, 2]
  ]
}

export async function start () {
  const device = await getGpuDevice().catch(() => null)
  if (device) setParticleBudget(GPU_PARTICLES)
  seedRandom(SEED)
  const radius = computeDefaultInteractionRadius(W, H)
  const params = {
    particleCount: computeDefaultParticleCount(W, H), interactionRadius: radius, stiffness: computeDefaultStiffness(W, H), stiffnessNear: computeDefaultStiffnessNear(W, H), restDensity: defaultRestDensity,
    maxTemp: computeDefaultMaxTemp(H), gravity: computeDefaultGravity(H), particleSize: computeDefaultParticleSize(W, H), stir: defaultStir, conduction: defaultConduction, turbulence: defaultTurbulence, drifters: defaultDrifters, heatSpots: defaultHeatSpots, cupDepth: defaultCupDepth,
    wobble: defaultWobble, wobbleKick: defaultWobbleKick, wobbleMax: defaultWobbleMax, settle: defaultSettle, viscosity: defaultViscosity, reach: device ? GPU_REACH : 1, kickBelow: defaultSkin, wallPush: defaultWall,
    elementHeat: defaultElementHeat, elementLife: defaultElementLife, elementRate: defaultElementRate, elementLifeScale: defaultElementLifeScale, elementCore: defaultElementCore, floorHeat: defaultFloorHeat, floorGlow: defaultFloorGlow,
    spawnArea: 14 * (radius / 20) * (radius / 20), touchHeat: 48, capacity: GPU_PARTICLES
  }
  const look = {
    lavaColor: defaultLavaColor, highlightColor: defaultLavaHighlight, ...defaultHeatColors, flowSlow: defaultFlowSlow, flowFast: defaultFlowFast,
    particleSize: params.particleSize, smooth: computeDefaultSmooth(W, H), blend: computeDefaultBlend(W, H), showHeat: true, showFlow: false, showHeater: false, showCups: false
  }
  const sim = device ? createGpuLamp({ device, width: W, height: H, params }) : createSimulation({ width: W, height: H, params })
  const lampBox = div({ class: 'lamp' })
  const canvas = document.createElement('canvas')
  lampBox.appendChild(canvas)
  const renderer = createRenderer(canvas, look)
  renderer.resize(W, H)
  const touchMode = fnstate('heat')
  const pointer = createPointerInput(canvas, (px, py) => { const r = canvas.getBoundingClientRect(); return [px - r.left, py - r.top] })

  // The sound and its tune, every number a knob.
  const gloop = createGloop()
  const sound = fnstate(false)
  const pending = fnstate(false)
  const bed = fnstate('simmer')
  const pace = fnstate(defaultPace)
  const states = {}
  for (const group of Object.values(KNOBS)) for (const [key] of group) states[key] = fnstate(TUNE[key])
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null')
    if (saved) { for (const k in states) if (k in saved) states[k](saved[k]); if (saved.bed) bed(saved.bed) }
  } catch (e) { /* a bad save is no save */ }
  const save = () => { const out = { bed: bed() }; for (const k in states) out[k] = states[k](); localStorage.setItem(STORE, JSON.stringify(out)) }
  for (const k in states) { gloop.tune[k] = states[k](); states[k].subscribe(v => { gloop.tune[k] = Number(v); save() }) }
  gloop.setBed(bed())
  bed.subscribe(name => { gloop.setBed(name); save() })
  sound.subscribe(on => { pending(!!on); gloop.set(on).then(() => pending(false)) })
  const copied = fnstate(false)
  function copy () {
    const out = { bed: bed() }
    for (const k in states) out[k] = states[k]()
    navigator.clipboard.writeText(JSON.stringify(out)).then(() => { copied(true); setTimeout(() => copied(false), 1500) })
  }
  function reset () { for (const k in states) states[k](TUNE[k]); bed('simmer') }

  // The readout: what the lava fired in the last second or two, and how stirred it reads.
  const readout = fnstate('')
  let lastStats = gloop.stats
  let lastReadout = performance.now()
  function updateReadout () {
    const now = performance.now()
    if (now - lastReadout < 1000) return
    const s = gloop.stats
    const dt = (now - lastReadout) / 1000
    readout(`agitation ${s.agitation.toFixed(2)}   bloops ${((s.bloops - lastStats.bloops) / dt).toFixed(1)}/s   pops ${((s.pops - lastStats.pops) / dt).toFixed(1)}/s   glugs ${((s.glugs - lastStats.glugs) / dt).toFixed(1)}/s   ${s.state}`)
    lastStats = s
    lastReadout = now
  }

  const help = fnstate(true)
  const fixed = digits => v => Number(v).toFixed(digits)
  const groups = Object.entries(KNOBS).map(([title, list]) => [
    div({ class: 'row-label', style: { marginTop: '8px', opacity: 0.7 } }, title),
    knobs(...list.map(([key, label, min, max, step, digits]) => knob(label, `tune-${key}`, states[key], { min, max, step, scales: DECADES }, () => TUNE[key], fixed(digits))))
  ]).flat()
  const panel = div(
    { class: 'panel' },
    row('Sound', div({ class: pending.bindAttr(() => pending() ? 'pending' : '') }, toggle('sound', sound))),
    row('Bed', segmented('bed', bed, BEDS)),
    row('Finger', segmented('touch', touchMode, ['push', 'pull', 'spin', 'heat', 'cool'])),
    knobs(knob('Pace', 'pace', pace, { min: 0.1, max: 1, step: 0.05 }, () => defaultPace, v => `${Number(v).toFixed(2)}x`)),
    div({ class: 'buttons' },
      button({ class: 'small', onclick: () => gloop.play('bloop', 0.1, 1, 0) }, 'Speck'),
      button({ class: 'small', onclick: () => gloop.play('bloop', 0.5, 1, 0) }, 'Bloop'),
      button({ class: 'small', onclick: () => gloop.play('bloop', 0.95, 1, 0) }, 'Big snap'),
      button({ class: 'small', onclick: () => gloop.play('pop', 0.2, 0.3, 0) }, 'Pop'),
      button({ class: 'small', onclick: () => gloop.play('glug', 0.2, 1, 0) }, 'Small glug'),
      button({ class: 'small', onclick: () => gloop.play('glug', 0.9, 1, 0) }, 'Big glug')
    ),
    div({ class: 'readout' }, readout.bindAs(() => readout())),
    hint(help, 'The lamp runs on the left with the lamp\'s own defaults. Turn Sound on, pick a Bed, and turn the numbers while it plays; the buttons play each voice by hand at a small and a big size. Fast is the speed, in gravities, above which a particle counts as moving; Burst the jump in a column\'s moving count that fires a bloop, as a share of the lava. Every change is kept in this browser.'),
    ...groups,
    div({ class: 'actions' },
      button({ onclick: copy }, copied.bindAs(() => copied() ? 'Copied' : 'Copy settings')),
      button({ onclick: reset }, 'Reset')
    )
  )
  document.body.appendChild(div({ class: 'board' }, lampBox, panel))
  window.soundBoard = { sim, gloop, params, look } // for poking from the console

  // The lamp's own loop, at Pace, drawing between steps so slow motion stays smooth.
  let previous = { x: new Float32Array(0), y: new Float32Array(0) }
  const shown = { x: new Float32Array(0), y: new Float32Array(0), temp: null }
  let due = 0
  function frame () {
    const mode = touchMode()
    sim.setTouches(pointer.consume(FRAME).map(p => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, mode })))
    due += pace()
    while (due >= 1) {
      due -= 1
      if (previous.x.length !== sim.count) previous = { x: new Float32Array(sim.count), y: new Float32Array(sim.count) }
      previous.x.set(sim.state.x.subarray(0, sim.count))
      previous.y.set(sim.state.y.subarray(0, sim.count))
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
    renderer.render(shown, count, { flowAt: sim.flowAt, heaterAt: sim.heaterAt, elements: sim.heaterElements, neutral: params.gravity, view: null })
    if (gloop.enabled) gloop.update(sim.state, sim.count, W, H, params.gravity, FRAME * pace())
    updateReadout()
    requestAnimationFrame(frame)
  }
  frame()
}
