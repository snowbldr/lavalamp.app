// Sound evolution: breed the sound of the lamp by ear (Robert: "we should use a genetic
// evolution algorithm here to find the best sound for each motion. I think we'll need to create
// multiple short lava lamp clips then make noise for the clip, 16 variations and run the genetic
// evolution until we get good sounds"). The fitness function is Robert. Record a few short clips
// of the lamp (the picture, and the events the detector fired with their times, and the
// agitation curve); a generation is sixteen genomes, each a full mapping from events to sounds
// (a voice per event kind, synth or one of the plop recordings, pitched, stretched, levelled;
// and a bed, one of the bubbling recordings following the agitation, or none); play any genome
// over any clip, star the ones that sound right, and Breed makes the next sixteen from the
// stars by crossover and mutation. The best genome copies out as JSON for the lamp.
import { button, div, fnstate, p, span, video as videoEl } from '@srfnstack/fntags'
import { createGpuLamp, getGpuDevice } from '../src/sim/gpuSimulation.js'
import { createSimulation } from '../src/sim/simulation.js'
import { seedRandom } from '../src/sim/random.js'
import { createRenderer } from '../src/render/renderer.js'
import { createGloop } from '../src/audio/gloop.js'
import { createSamplePlayer } from './samplePlayer.js'
import {
  GPU_PARTICLES, GPU_REACH, setParticleBudget,
  computeDefaultParticleCount, computeDefaultInteractionRadius, computeDefaultParticleSize, computeDefaultSmooth, computeDefaultBlend,
  computeDefaultStiffness, computeDefaultStiffnessNear, computeDefaultMaxTemp, computeDefaultGravity,
  defaultRestDensity, defaultStir, defaultConduction, defaultPace, defaultTurbulence, defaultDrifters, defaultHeatSpots, defaultCupDepth,
  defaultWobble, defaultWobbleKick, defaultWobbleMax, defaultSettle, defaultViscosity, defaultSkin, defaultWall,
  defaultElementHeat, defaultElementLife, defaultElementRate, defaultElementLifeScale, defaultElementCore, defaultFloorHeat, defaultFloorGlow,
  defaultHeatColors, defaultFlowSlow, defaultFlowFast
} from '../src/ui/settings.js'

const W = 300
const H = 450
const FRAME = 1 / 60
const CLIP_SECONDS = 6
const POPULATION = 16
const EVENTS = ['snap', 'lift', 'land', 'pour', 'spill']
const STORE = 'sound-evolution'

// The genome's numbers, each with a range: a voice per event, and the bed.
const VOICE_GENES = { pitch: [-24, 24], pitchBySize: [-24, 24], stretch: [0.5, 2.5], gain: [0, 1], cooldown: [0.05, 0.6], bloopLow: [30, 120], bloopSpan: [50, 600], bloopSlow: [0.5, 3] }
const BED_GENES = { gain: [0, 0.8], follow: [0, 1], cutoff: [300, 8000], rate: [0.5, 1.5] }
const VOICE_KINDS = ['off', 'synth', 'sample']
const BED_KINDS = ['off', 'sample']

const rand = (lo, hi) => lo + Math.random() * (hi - lo)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2
const pick = list => list[Math.floor(Math.random() * list.length)]

export async function start () {
  const device = await getGpuDevice().catch(() => null)
  if (device) setParticleBudget(GPU_PARTICLES)
  seedRandom(11)
  const radius = computeDefaultInteractionRadius(W, H)
  const params = {
    particleCount: computeDefaultParticleCount(W, H), interactionRadius: radius, stiffness: computeDefaultStiffness(W, H), stiffnessNear: computeDefaultStiffnessNear(W, H), restDensity: defaultRestDensity,
    maxTemp: computeDefaultMaxTemp(H), gravity: computeDefaultGravity(H), particleSize: computeDefaultParticleSize(W, H), stir: defaultStir, conduction: defaultConduction, turbulence: defaultTurbulence, drifters: defaultDrifters, heatSpots: defaultHeatSpots, cupDepth: defaultCupDepth,
    wobble: defaultWobble, wobbleKick: defaultWobbleKick, wobbleMax: defaultWobbleMax, settle: defaultSettle, viscosity: defaultViscosity, reach: device ? GPU_REACH : 1, kickBelow: defaultSkin, wallPush: defaultWall,
    elementHeat: defaultElementHeat, elementLife: defaultElementLife, elementRate: defaultElementRate, elementLifeScale: defaultElementLifeScale, elementCore: defaultElementCore, floorHeat: defaultFloorHeat, floorGlow: defaultFloorGlow,
    spawnArea: 14 * (radius / 20) * (radius / 20), touchHeat: 48, capacity: GPU_PARTICLES
  }
  const look = { lavaColor: { r: 133, g: 0, b: 204 }, ...defaultHeatColors, flowSlow: defaultFlowSlow, flowFast: defaultFlowFast, particleSize: params.particleSize, smooth: computeDefaultSmooth(W, H), blend: computeDefaultBlend(W, H), showHeat: true, showFlow: false, showHeater: false, showCups: false }
  const sim = device ? createGpuLamp({ device, width: W, height: H, params }) : createSimulation({ width: W, height: H, params })
  const lampBox = div({ class: 'lamp' })
  const canvas = document.createElement('canvas')
  lampBox.appendChild(canvas)
  const renderer = createRenderer(canvas, look)
  renderer.resize(W, H)

  // Sound: the detector runs silent while recording; the voices and samples play the genomes.
  const gloop = createGloop()
  gloop.setSilent(true)
  gloop.setBed('none')
  const player = createSamplePlayer(() => gloop.context, () => gloop.master)
  const beds = [] // samples of kind bed
  const plops = []
  const status = fnstate('Press Start: it turns the sound on (a click is needed) and loads the recordings.')
  let started = false
  async function begin () {
    if (started) return
    started = true
    await gloop.set(true)
    const list = await (await fetch('./samples/manifest.json', { cache: 'no-cache' })).json()
    for (const item of list) {
      try {
        const buffer = await gloop.context.decodeAudioData(await (await fetch(`./samples/${item.file}`)).arrayBuffer())
        const sample = player.add(item.name, buffer, item)
        if (item.kind === 'plop') plops.push(sample); else beds.push(sample)
      } catch (e) { console.warn('sample', item.file, e) }
    }
    status(`${plops.length} plops and ${beds.length} beds loaded. Record a clip or two, then play the cells.`)
    if (!population.length) newGeneration()
  }

  // Clips: the picture as a webm from the canvas, the events with wall clock times from the
  // start, and the agitation every tenth of a second.
  const clips = []
  const clipList = div({ class: 'clips' })
  const current = fnstate(-1)
  let recording = null
  gloop.onEvent = e => { if (recording) recording.events.push({ type: e.type, x: e.x, y: e.y, size: e.size, strength: e.strength, t: (performance.now() - recording.start) / 1000 }) }
  async function recordClip () {
    await begin()
    if (recording) return
    const stream = canvas.captureStream(30)
    const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' })
    const chunks = []
    recorder.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data) }
    recording = { start: performance.now(), events: [], agitation: [] }
    const ticker = setInterval(() => { if (recording) recording.agitation.push(gloop.agitation) }, 100)
    status(`Recording ${CLIP_SECONDS} s...`)
    recorder.start()
    await new Promise(r => setTimeout(r, CLIP_SECONDS * 1000))
    recorder.stop()
    await new Promise(r => { recorder.onstop = r })
    clearInterval(ticker)
    const clip = { url: URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })), events: recording.events, agitation: recording.agitation, duration: CLIP_SECONDS }
    recording = null
    clips.push(clip)
    const k = clips.length - 1
    const v = videoEl({ src: clip.url, muted: true, playsinline: true, preload: 'metadata' })
    clipList.appendChild(div({ class: current.bindAttr(() => current() === k ? 'clip on' : 'clip'), onclick: () => { current(k); for (const cell of cells) cell.video.src = clip.url } }, v, div({ class: 'readout' }, `${clip.events.length} events`)))
    current(k)
    for (const cell of cells) cell.video.src = clip.url
    status(`Clip ${k + 1}: ${clip.events.length} events (${EVENTS.map(t => `${t} ${clip.events.filter(e => e.type === t).length}`).join(', ')}).`)
  }

  // Genomes.
  function randomVoice () {
    const g = { kind: pick(VOICE_KINDS), sample: Math.floor(Math.random() * Math.max(1, plops.length)) }
    for (const [k, [lo, hi]] of Object.entries(VOICE_GENES)) g[k] = rand(lo, hi)
    return g
  }
  function randomBed () {
    const g = { kind: pick(BED_KINDS), sample: Math.floor(Math.random() * Math.max(1, beds.length)) }
    for (const [k, [lo, hi]] of Object.entries(BED_GENES)) g[k] = rand(lo, hi)
    return g
  }
  const randomGenome = () => ({ voices: Object.fromEntries(EVENTS.map(t => [t, randomVoice()])), bed: randomBed() })
  function mutateVoice (v, rate) {
    const g = { ...v }
    if (Math.random() < rate * 0.4) g.kind = pick(VOICE_KINDS)
    if (Math.random() < rate * 0.4) g.sample = Math.floor(Math.random() * Math.max(1, plops.length))
    for (const [k, [lo, hi]] of Object.entries(VOICE_GENES)) if (Math.random() < rate) g[k] = clamp(g[k] + gauss() * 0.15 * (hi - lo), lo, hi)
    return g
  }
  function mutateBed (b, rate) {
    const g = { ...b }
    if (Math.random() < rate * 0.4) g.kind = pick(BED_KINDS)
    if (Math.random() < rate * 0.4) g.sample = Math.floor(Math.random() * Math.max(1, beds.length))
    for (const [k, [lo, hi]] of Object.entries(BED_GENES)) if (Math.random() < rate) g[k] = clamp(g[k] + gauss() * 0.15 * (hi - lo), lo, hi)
    return g
  }
  const mutate = (g, rate = 0.3) => ({ voices: Object.fromEntries(EVENTS.map(t => [t, mutateVoice(g.voices[t], rate)])), bed: mutateBed(g.bed, rate) })
  const cross = (a, b) => ({ voices: Object.fromEntries(EVENTS.map(t => [t, { ...(Math.random() < 0.5 ? a : b).voices[t] }])), bed: { ...(Math.random() < 0.5 ? a : b).bed } })
  const summary = g => EVENTS.map(t => { const v = g.voices[t]; return `${t}: ${v.kind === 'off' ? 'off' : v.kind === 'synth' ? `synth ${v.bloopLow.toFixed(0)}+${v.bloopSpan.toFixed(0)}Hz` : (plops[v.sample] ? plops[v.sample].name : 'sample')} ${v.pitch >= 0 ? '+' : ''}${v.pitch.toFixed(0)}st x${v.stretch.toFixed(2)} g${v.gain.toFixed(2)}` }).join('\n') + `\nbed: ${g.bed.kind === 'off' ? 'off' : (beds[g.bed.sample] ? beds[g.bed.sample].name : 'sample')} g${g.bed.gain.toFixed(2)} follow ${g.bed.follow.toFixed(2)} lp${g.bed.cutoff.toFixed(0)}`

  // Playing a genome over the current clip: the video, the events scheduled on the audio clock.
  let playing = null // { stops: [] , cell }
  function stopPlaying () {
    if (!playing) return
    for (const stop of playing.stops) stop()
    playing.cell.video.pause()
    playing.cell.el.classList.remove('playing')
    playing = null
  }
  function playCell (cell) {
    stopPlaying()
    const clip = clips[current()]
    if (!clip || !gloop.context) return
    const g = cell.genome
    const context = gloop.context
    const t0 = context.currentTime + 0.1
    const stops = []
    cell.video.currentTime = 0
    cell.video.play()
    cell.el.classList.add('playing')
    for (const e of clip.events) {
      const v = g.voices[e.type]
      if (!v || v.kind === 'off') continue
      const pan = e.x * 2 - 1
      if (v.kind === 'synth') {
        const timer = setTimeout(() => gloop.play('bloop', e.size, 0.3 + 0.7 * v.gain, pan, { bloopLow: v.bloopLow, bloopSpan: v.bloopSpan, bloopSlow: v.bloopSlow, bloopLevel: 0.5 * v.gain }), e.t * 1000 + 100)
        stops.push(() => clearTimeout(timer))
      } else if (plops[v.sample]) {
        player.play(plops[v.sample], { size: e.size, strength: 1, pan, at: t0 + e.t, settings: { pitch: v.pitch, pitchBySize: v.pitchBySize, stretch: v.stretch, gain: v.gain, cooldown: v.cooldown, start: 0, end: 1 } })
      }
    }
    if (g.bed.kind === 'sample' && beds[g.bed.sample]) {
      const curve = clip.agitation.map(a => (1 - g.bed.follow) + g.bed.follow * a)
      stops.push(player.loop(beds[g.bed.sample], { at: t0, gain: g.bed.gain, curve, step: 0.1, cutoff: g.bed.cutoff, rate: g.bed.rate }))
    }
    const end = setTimeout(() => { if (playing && playing.cell === cell) stopPlaying() }, clip.duration * 1000 + 400)
    stops.push(() => clearTimeout(end))
    playing = { stops, cell }
  }

  // The population and the grid.
  let population = []
  let generation = 0
  const cells = []
  const grid = div({ class: 'grid' })
  const genLabel = fnstate('')
  function showPopulation () {
    grid.replaceChildren()
    cells.length = 0
    population.forEach((genome, i) => {
      const star = fnstate(!!genome.star)
      const video = videoEl({ muted: true, playsinline: true, preload: 'metadata', src: clips[current()] ? clips[current()].url : '' })
      const cell = { genome, video, el: null }
      cell.el = div({ class: star.bindAttr(() => star() ? 'cell starred' : 'cell') },
        video,
        div({ class: 'info' },
          div({ class: 'buttons' },
            button({ class: 'small', onclick: () => playCell(cell) }, `▶ ${i + 1}`),
            button({ class: 'small star', onclick: () => { star(!star()); genome.star = star(); save() } }, star.bindAs(() => star() ? '★' : '☆'))
          ),
          div({ class: 'genes' }, summary(genome))
        )
      )
      cells.push(cell)
      grid.appendChild(cell.el)
    })
    genLabel(`Generation ${generation}`)
  }
  function newGeneration () {
    generation = 1
    population = Array.from({ length: POPULATION }, randomGenome)
    showPopulation(); save()
  }
  function breed () {
    const parents = population.filter(g => g.star)
    generation++
    if (parents.length === 0) { population = population.map(g => mutate(g, 0.3)); showPopulation(); save(); return }
    const next = parents.map(p => ({ ...p, star: false })) // the stars stay, unchanged
    while (next.length < POPULATION) {
      const a = pick(parents); const b = pick(parents)
      next.push(mutate(parents.length > 1 ? cross(a, b) : a, 0.25))
    }
    population = next.map(g => ({ voices: g.voices, bed: g.bed, star: false }))
    showPopulation(); save()
  }
  function save () { try { localStorage.setItem(STORE, JSON.stringify({ generation, population })) } catch (e) { /* no room is no matter */ } }
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null')
    if (saved && saved.population && saved.population.length === POPULATION) { generation = saved.generation; population = saved.population }
  } catch (e) { /* a bad save is no save */ }
  const copied = fnstate(false)
  function copyStarred () {
    const best = population.filter(g => g.star).map(g => ({ voices: g.voices, bed: g.bed }))
    navigator.clipboard.writeText(JSON.stringify(best.length ? best : population, null, 1)).then(() => { copied(true); setTimeout(() => copied(false), 1500) })
  }

  document.body.appendChild(div(
    div({ class: 'top' },
      lampBox,
      div({ class: 'controls' },
        div({ class: 'buttons' },
          button({ onclick: begin }, 'Start'),
          button({ onclick: recordClip }, `Record clip (${CLIP_SECONDS} s)`),
          button({ onclick: breed }, 'Breed from stars'),
          button({ onclick: newGeneration }, 'New random generation'),
          button({ onclick: copyStarred }, copied.bindAs(() => copied() ? 'Copied' : 'Copy starred genomes')),
          button({ onclick: stopPlaying }, 'Stop')
        ),
        div({ class: 'readout' }, status.bindAs(() => status())),
        p('Record a few clips of the lamp as it runs on the left (the picture, the events the detector fires, the agitation). Pick a clip, then press ▶ on a cell: the clip plays with that genome\'s sounds. Star the ones that sound right and Breed: the stars survive and the rest are their children, crossed and mutated. Each genome is a voice per event (synth bloop or one of the plop recordings, with pitch, pitch by size, stretch, gain, cooldown) and a bed (a bubbling recording following the agitation, or none).'),
        div({ class: 'readout' }, genLabel.bindAs(() => genLabel())),
        clipList
      )
    ),
    grid
  ))
  if (population.length) showPopulation()
  window.evolution = { sim, gloop, player, clips, get population () { return population } }

  let previous = { x: new Float32Array(0), y: new Float32Array(0) }
  const shown = { x: new Float32Array(0), y: new Float32Array(0), temp: null }
  let due = 0
  function frame () {
    sim.setTouches([])
    due += defaultPace
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
    for (let i = 0; i < count; i++) { shown.x[i] = previous.x[i] + (x[i] - previous.x[i]) * due; shown.y[i] = previous.y[i] + (y[i] - previous.y[i]) * due }
    shown.temp = sim.state.temp
    renderer.render(shown, count, { flowAt: sim.flowAt, heaterAt: sim.heaterAt, elements: sim.heaterElements, neutral: params.gravity, view: null })
    if (gloop.enabled) gloop.update(sim.state, sim.count, W, H, params.gravity, FRAME * defaultPace)
    requestAnimationFrame(frame)
  }
  frame()
}
