// The sound board: the lamp running beside every number the sound is made of, so the gloops can
// be tuned by ear while the lava does its thing (Robert: "How about we create a little sound
// board experiment for playing with the sounds along with the lava"). Buttons play each voice by
// hand, a readout counts what the lava fired, Copy settings gives the tune as one line of JSON
// to paste back, and the last tune is kept in this browser.
import { a, button, div, fnstate, input, span } from '@srfnstack/fntags'
import { createGpuLamp, getGpuDevice } from '../src/sim/gpuSimulation.js'
import { createSimulation } from '../src/sim/simulation.js'
import { seedRandom } from '../src/sim/random.js'
import { createRenderer } from '../src/render/renderer.js'
import { createPointerInput } from '../src/input/pointer.js'
import { BEDS, EVENTS, TUNE, createGloop } from '../src/audio/gloop.js'
import { DECADES, hint, knob, knobs, row, segmented, toggle } from '../src/ui/components.js'
import { DEFAULTS as SAMPLE_DEFAULTS, SAMPLE_EVENTS, createSamplePlayer } from './samplePlayer.js'
import {
  GPU_PARTICLES, GPU_REACH, setBackend,
  computeDefaultParticleCount, computeDefaultInteractionRadius, computeDefaultParticleSize, computeDefaultSmooth, computeDefaultBlend,
  computeDefaultStiffness, computeDefaultStiffnessNear, computeDefaultMaxTemp, computeDefaultGravity,
  defaultRestDensity, defaultStir, defaultConduction, defaultPace, defaultTurbulence, defaultDrifters, defaultHeatSpots, defaultCupDepth,
  defaultWobble, defaultWobbleKick, defaultWobbleMax, defaultSettle, defaultViscosity, defaultSkin, defaultWall,
  defaultElementHeat, defaultElementLife, defaultElementRate, defaultElementLifeScale, defaultElementCore, defaultFloorHeat, defaultFloorGlow,
  defaultHeatColors, defaultFlowSlow, defaultFlowFast
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
  if (device) setBackend('gpu')
  seedRandom(SEED)
  const radius = computeDefaultInteractionRadius(W, H)
  const params = {
    particleCount: computeDefaultParticleCount(W, H), interactionRadius: radius, stiffness: computeDefaultStiffness(W, H), stiffnessNear: computeDefaultStiffnessNear(W, H), restDensity: defaultRestDensity(),
    maxTemp: computeDefaultMaxTemp(H), gravity: computeDefaultGravity(H), particleSize: computeDefaultParticleSize(W, H), stir: defaultStir, conduction: defaultConduction(), turbulence: defaultTurbulence, drifters: defaultDrifters, heatSpots: defaultHeatSpots(), cupDepth: defaultCupDepth,
    wobble: defaultWobble, wobbleKick: defaultWobbleKick, wobbleMax: defaultWobbleMax(), settle: defaultSettle, viscosity: defaultViscosity, reach: device ? GPU_REACH : 1, kickBelow: defaultSkin, wallPush: defaultWall,
    elementHeat: defaultElementHeat(), elementLife: defaultElementLife, elementRate: defaultElementRate, elementLifeScale: defaultElementLifeScale, elementCore: defaultElementCore, floorHeat: defaultFloorHeat, floorGlow: defaultFloorGlow,
    spawnArea: 14 * (radius / 20) * (radius / 20), touchHeat: 48, capacity: GPU_PARTICLES
  }
  const look = {
    lavaColor: { r: 133, g: 0, b: 204 }, ...defaultHeatColors, flowSlow: defaultFlowSlow, flowFast: defaultFlowFast,
    particleSize: params.particleSize, smooth: computeDefaultSmooth(W, H), blend: computeDefaultBlend(W, H), showHeat: true, showFlow: false, showHeater: false, showCups: false
  }
  const sim = device ? createGpuLamp({ device, width: W, height: H, params }) : createSimulation({ width: W, height: H, params })
  const lampBox = div({ class: 'lamp' })
  const canvas = document.createElement('canvas')
  lampBox.appendChild(canvas)
  // The markers: a numbered ring where each event fired, fading over a second, on a canvas over
  // the lamp, so the ear and the eye can be checked against each other (Robert: "the correlation
  // of the visual to the audio still seems off").
  const marks = document.createElement('canvas')
  marks.width = W; marks.height = H
  marks.style.pointerEvents = 'none'
  lampBox.appendChild(marks)
  const marksContext = marks.getContext('2d')
  const EVENT_COLOURS = { snap: '#ffffff', lift: '#4cff4c', land: '#ff4c4c', pour: '#4c9cff', spill: '#ffd34c' }
  const live = [] // { type, x, y, at }
  const log = fnstate('')
  const recent = []
  const renderer = createRenderer(canvas, look)
  renderer.resize(W, H)
  const touchMode = fnstate('heat')
  const pointer = createPointerInput(canvas, (px, py) => { const r = canvas.getBoundingClientRect(); return [px - r.left, py - r.top] })

  // The sound and its tune, every number a knob.
  const gloop = createGloop()
  const sound = fnstate(false)
  const pending = fnstate(false)
  const bed = fnstate('simmer')
  const ticks = fnstate(false)
  ticks.subscribe(on => gloop.setTicks(on))
  // Recorded samples, each tied to an event (see samplePlayer.js), from experiments/samples/
  // and from files dropped in. Their settings are kept in this browser by name.
  const player = createSamplePlayer(() => gloop.context, () => gloop.master)
  const SAMPLE_STORE = 'sound-board-samples'
  const sampleSettings = (() => { try { return JSON.parse(localStorage.getItem(SAMPLE_STORE) || '{}') } catch (e) { return {} } })()
  const saveSamples = () => { for (const s of player.samples) sampleSettings[s.name] = s.settings; localStorage.setItem(SAMPLE_STORE, JSON.stringify(sampleSettings)) }
  const sampleList = div({ class: 'samples' })
  const pads = div({ class: 'pads' }) // one big button per sample, the board itself
  const selected = fnstate('')
  const SAMPLE_KNOBS = [
    ['gain', 'Gain', 0, 1, 0.01, 2], ['pitch', 'Pitch', -36, 36, 1, 0], ['stretch', 'Stretch', 0.1, 6, 0.05, 2],
    ['start', 'Start', 0, 1, 0.01, 2], ['end', 'End', 0, 1, 0.01, 2], ['pitchBySize', 'Pitch/size', -36, 36, 1, 0], ['stretchBySize', 'Stretch/size', -4, 4, 0.1, 1], ['cooldown', 'Cooldown', 0, 2, 0.05, 2]
  ]
  function addSample (name, buffer, meta) {
    const sample = player.add(name, buffer, meta, sampleSettings[name] || {})
    const states = {}
    for (const [key] of SAMPLE_KNOBS) { states[key] = fnstate(sample.settings[key]); states[key].subscribe(v => { sample.settings[key] = Number(v); saveSamples() }) }
    const event = fnstate(sample.settings.event)
    event.subscribe(v => { sample.settings.event = v; saveSamples() })
    pads.appendChild(button({ class: selected.bindAttr(() => selected() === name ? 'pad on' : 'pad'), onclick: () => { player.play(sample, { size: 0.5 }); selected(name) } }, name))
    const card = div({ class: 'sample', style: { display: selected.bindStyle(() => selected() === name ? 'block' : 'none') } },
      div({ class: 'sample-title' },
        button({ class: 'small', onclick: () => player.play(sample, { size: 0.5 }) }, '▶'),
        ' ', span(name), ' ',
        span({ class: 'readout' }, `${buffer.duration.toFixed(2)} s`), ' ',
        meta.source ? a({ href: meta.source, target: '_blank', rel: 'noopener', style: { color: '#9ab' } }, meta.license || 'source') : ''
      ),
      div({ class: 'buttons' },
        button({ class: 'small', onclick: () => player.play(sample, { size: 0.1 }) }, 'small'),
        button({ class: 'small', onclick: () => player.play(sample, { size: 0.9 }) }, 'big')
      ),
      row('Event', segmented(`${name}-event`, event, SAMPLE_EVENTS)),
      knobs(...SAMPLE_KNOBS.map(([key, label, min, max, step, digits]) => knob(label, `${name}-${key}`, states[key], { min, max, step, scales: DECADES }, () => SAMPLE_DEFAULTS[key], fixed(digits))))
    )
    sampleList.appendChild(card)
  }
  async function loadSample (name, url, meta) {
    const context = gloop.context
    if (!context) return
    const bytes = await (await fetch(url)).arrayBuffer()
    const buffer = await context.decodeAudioData(bytes)
    addSample(name, buffer, meta)
  }
  let manifestLoaded = false
  async function loadManifest () {
    if (manifestLoaded || !gloop.context) return
    manifestLoaded = true
    try {
      const list = await (await fetch('./samples/manifest.json', { cache: 'no-cache' })).json()
      for (const item of list) await loadSample(item.name, `./samples/${item.file}`, item).catch(err => console.warn('sample', item.file, err))
    } catch (e) { console.warn('no samples manifest', e) }
  }
  const filePicker = input({ type: 'file', accept: 'audio/*', multiple: true, onchange: async ev => { for (const file of ev.target.files) { const buffer = await gloop.context.decodeAudioData(await file.arrayBuffer()); addSample(file.name.replace(/\.[^.]+$/, ''), buffer, { source: '', license: 'your file' }) } } })
  gloop.onEvent = e => {
    player.trigger(e)
    live.push({ ...e, at: performance.now() })
    recent.unshift(`${e.time.toFixed(1).padStart(6)}s  ${e.type.padEnd(5)}  x ${(e.x * 100).toFixed(0).padStart(3)}%  y ${(e.y * 100).toFixed(0).padStart(3)}%  size ${e.size.toFixed(2)}`)
    if (recent.length > 12) recent.pop()
    log(recent.join('\n'))
  }
  function drawMarks () {
    marksContext.clearRect(0, 0, W, H)
    const now = performance.now()
    for (let i = live.length - 1; i >= 0; i--) {
      const m = live[i]
      const age = (now - m.at) / 1000
      if (age > 1) { live.splice(i, 1); continue }
      const px = m.x * W
      const py = Math.max(12, Math.min(H - 12, m.y * H))
      marksContext.globalAlpha = 1 - age
      marksContext.strokeStyle = EVENT_COLOURS[m.type]
      marksContext.lineWidth = 3
      marksContext.beginPath()
      marksContext.arc(px, py, 14 + age * 30, 0, Math.PI * 2)
      marksContext.stroke()
      marksContext.fillStyle = EVENT_COLOURS[m.type]
      marksContext.font = 'bold 16px system-ui, sans-serif'
      marksContext.textAlign = 'center'
      marksContext.fillText(String(EVENTS.indexOf(m.type) + 1), px, py + 6)
    }
    marksContext.globalAlpha = 1
  }
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
  sound.subscribe(on => { pending(!!on); gloop.set(on).then(() => { pending(false); loadManifest() }) })
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
    const per = k => ((s[k] - lastStats[k]) / dt).toFixed(1)
    readout(`agitation ${s.agitation.toFixed(2)}   snap ${per('snap')}  lift ${per('lift')}  land ${per('land')}  pour ${per('pour')}  spill ${per('spill')}  merge ${per('merge')} /s   pops ${per('pops')}/s   ${s.state}`)
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
    hint(help, 'Turn Sound on and the pads load: one per recorded sound in experiments/samples (Pixabay, Pixabay Content License) plus any files you add. Tap a pad to hear it; its settings open underneath: which lava event fires it, pitch, stretch, trim, and how the event\'s size bends the pitch and the stretch.'),
    pads,
    row('Add files', filePicker),
    sampleList,
    row('Bed', segmented('bed', bed, BEDS)),
    row('Ticks', toggle('ticks', ticks)),
    div({ class: 'buttons' }, ...EVENTS.map((type, k) => button({ class: 'small', style: { color: EVENT_COLOURS[type] }, onclick: () => gloop.playTick(type) }, `${k + 1} ${type}`))),
    hint(help, 'Ticks plays one short sound per event instead of the voices, and a numbered ring marks where it fired: 1 snap (click, a burst moving both ways), 2 lift (rising chirp), 3 land (falling chirp), 4 pour (thud, lava crossing the floor line), 5 spill (double click, lava crossing the lip). The buttons play each tick to learn it. The log below lists the last events.'),
    div({ class: 'readout' }, log.bindAs(() => log())),
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
    if (gloop.enabled) gloop.update(sim.state, sim.count, W, H, params.gravity, FRAME * pace(), params.interactionRadius)
    drawMarks()
    updateReadout()
    requestAnimationFrame(frame)
  }
  frame()
}
