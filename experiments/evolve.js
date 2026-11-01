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
//
// Second pass, the space narrowed (Robert: "none of the stuff in the genetic evolution really
// makes that kind of a sound. Maybe we should just like, generate a bunch of random sounds with
// genetic evolution based on those natural sounds I said sounded the best as a start, but then
// like random synth added in to make custom gloopy lava sounds"; "we need to narrow the problem
// space on the current genetic evolution audio solver. The random generations seem like they
// can't generate a good combo yet"). A voice is now two layers mixed: a recording from the ones
// he liked (viscous liquid fall in whole, or a short cut out of water gloops and glops or the
// two good beds) and a gloop synth built for the job (a sine that bends, wobbles and has a
// throat, with a wet noise band, a consonant at the start and a thud at the end), every gene in
// a range that sounds like liquid. The bed is one of the two good beds. The first generation
// is not uniform noise but a preset per event (a short click for a snap, a rising gloop for a
// lift, a long GALooooOOOOOooPP for a merge) mutated sixteen ways; Wild generation still gives
// the old uniform randomness for exploring.
import { button, div, fnstate, p, span, video as videoEl } from '@srfnstack/fntags'
import { createGpuLamp, getGpuDevice } from '../src/sim/gpuSimulation.js'
import { createSimulation } from '../src/sim/simulation.js'
import { seedRandom } from '../src/sim/random.js'
import { createRenderer } from '../src/render/renderer.js'
import { createGloop } from '../src/audio/gloop.js'
import { createSamplePlayer } from './samplePlayer.js'
import {
  GPU_PARTICLES, GPU_REACH, setBackend,
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
const EVENTS = ['snap', 'lift', 'land', 'pour', 'spill', 'merge']
const STORE = 'sound-evolution-2' // the first pass's saves have the old genome shape

// The recordings Robert kept (2026-10-31: "hot bubbling mud and ambient bubbling liquid are the
// two that sound the best. viscous liquid fall in sounds pretty good too"; "there's some sounds
// in water gloops and glops that could work"). Plops play whole; cuts are short windows out of
// a long recording, where the window is a gene.
const LIKED_BEDS = ['hot bubbling mud', 'ambient bubbling liquid']
const LIKED_PLOPS = ['viscous liquid fall in']
const LIKED_CUTS = ['water gloops and glops', 'hot bubbling mud', 'ambient bubbling liquid']
// The genome's numbers, each with a range. A voice is a sample layer and a synth layer.
const SAMPLE_GENES = { start: [0, 0.95], length: [0.15, 1.0], pitch: [-12, 12], pitchBySize: [-12, 6], stretch: [0.7, 1.6], gain: [0, 1] }
const SYNTH_GENES = {
  gain: [0, 1], low: [40, 160], pitchBySize: [-12, 6], bend: [0.4, 2.5], bendTime: [0.05, 0.5], tail: [0.3, 1.6],
  attack: [0.005, 0.08], length: [0.12, 0.8], wobbleRate: [3, 12], wobbleDepth: [0, 0.25], throat: [0, 0.5],
  wet: [0, 0.6], wetFreq: [300, 1500], click: [0, 0.4], thump: [0, 0.6]
}
const BED_GENES = { gain: [0.2, 0.7], follow: [0.3, 1], cutoff: [800, 8000], rate: [0.85, 1.15] }
const SAMPLE_SOURCES = ['none', 'plop', 'cut']
// Where each event starts from: a preset per kind, mutated for the first generation.
const PRESETS = {
  snap: { sample: { source: 'plop', gain: 0.5, pitch: 3, stretch: 0.8 }, synth: { gain: 0.6, low: 120, bend: 1.8, bendTime: 0.05, tail: 0.8, attack: 0.005, length: 0.15, wobbleRate: 8, wobbleDepth: 0.05, throat: 0.2, wet: 0.2, wetFreq: 1100, click: 0.3, thump: 0.1 } },
  lift: { sample: { source: 'cut', gain: 0.4, pitch: 0, stretch: 1 }, synth: { gain: 0.6, low: 90, bend: 1.6, bendTime: 0.25, tail: 1.1, attack: 0.02, length: 0.35, wobbleRate: 6, wobbleDepth: 0.1, throat: 0.25, wet: 0.25, wetFreq: 800, click: 0.1, thump: 0.1 } },
  land: { sample: { source: 'plop', gain: 0.5, pitch: -3, stretch: 1 }, synth: { gain: 0.6, low: 110, bend: 0.6, bendTime: 0.15, tail: 0.9, attack: 0.01, length: 0.3, wobbleRate: 7, wobbleDepth: 0.05, throat: 0.2, wet: 0.3, wetFreq: 700, click: 0.15, thump: 0.4 } },
  pour: { sample: { source: 'cut', gain: 0.4, pitch: -5, stretch: 1.2 }, synth: { gain: 0.6, low: 55, bend: 0.8, bendTime: 0.2, tail: 0.9, attack: 0.03, length: 0.45, wobbleRate: 5, wobbleDepth: 0.12, throat: 0.3, wet: 0.4, wetFreq: 500, click: 0.05, thump: 0.3 } },
  spill: { sample: { source: 'plop', gain: 0.4, pitch: 6, stretch: 0.8 }, synth: { gain: 0.5, low: 140, bend: 1.4, bendTime: 0.08, tail: 0.9, attack: 0.005, length: 0.2, wobbleRate: 9, wobbleDepth: 0.05, throat: 0.15, wet: 0.3, wetFreq: 1300, click: 0.3, thump: 0.05 } },
  merge: { sample: { source: 'cut', gain: 0.4, pitch: -2, stretch: 1.1 }, synth: { gain: 0.7, low: 70, bend: 1.5, bendTime: 0.4, tail: 0.5, attack: 0.03, length: 0.6, wobbleRate: 6, wobbleDepth: 0.15, throat: 0.3, wet: 0.3, wetFreq: 900, click: 0.25, thump: 0.5 } }
}

const rand = (lo, hi) => lo + Math.random() * (hi - lo)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2
const pick = list => list[Math.floor(Math.random() * list.length)]

export async function start () {
  const device = await getGpuDevice().catch(() => null)
  if (device) setBackend('gpu')
  seedRandom(11)
  const radius = computeDefaultInteractionRadius(W, H)
  const params = {
    particleCount: computeDefaultParticleCount(W, H), interactionRadius: radius, stiffness: computeDefaultStiffness(W, H), stiffnessNear: computeDefaultStiffnessNear(W, H), restDensity: defaultRestDensity(),
    maxTemp: computeDefaultMaxTemp(H), gravity: computeDefaultGravity(H), particleSize: computeDefaultParticleSize(W, H), stir: defaultStir, conduction: defaultConduction(), turbulence: defaultTurbulence, drifters: defaultDrifters, heatSpots: defaultHeatSpots(), cupDepth: defaultCupDepth,
    wobble: defaultWobble, wobbleKick: defaultWobbleKick, wobbleMax: defaultWobbleMax(), settle: defaultSettle, viscosity: defaultViscosity, reach: device ? GPU_REACH : 1, kickBelow: defaultSkin, wallPush: defaultWall,
    elementHeat: defaultElementHeat(), elementLife: defaultElementLife(), elementRate: defaultElementRate(), elementLifeScale: defaultElementLifeScale, elementCore: defaultElementCore(), floorHeat: defaultFloorHeat, floorGlow: defaultFloorGlow,
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
  const beds = [] // the liked beds, in LIKED_BEDS order
  const plops = [] // the liked plops
  const cuts = [] // long recordings a voice can cut a window from
  const status = fnstate('Press Start: it turns the sound on (a click is needed) and loads the recordings.')
  let started = false
  async function begin () {
    if (started) return
    started = true
    await gloop.set(true)
    const list = await (await fetch('./samples/manifest.json', { cache: 'no-cache' })).json()
    for (const item of list) {
      if (!LIKED_BEDS.includes(item.name) && !LIKED_PLOPS.includes(item.name) && !LIKED_CUTS.includes(item.name)) continue
      try {
        const buffer = await gloop.context.decodeAudioData(await (await fetch(`./samples/${item.file}`)).arrayBuffer())
        const sample = player.add(item.name, buffer, item)
        if (LIKED_BEDS.includes(item.name)) beds[LIKED_BEDS.indexOf(item.name)] = sample
        if (LIKED_PLOPS.includes(item.name)) plops[LIKED_PLOPS.indexOf(item.name)] = sample
        if (LIKED_CUTS.includes(item.name)) cuts[LIKED_CUTS.indexOf(item.name)] = sample
      } catch (e) { console.warn('sample', item.file, e) }
    }
    status(`${plops.length} plops and ${beds.length} beds loaded. Record a clip or two, then play the cells.`)
    if (!population.length) newGeneration()
  }

  // Clips: the picture as a video from the canvas, the events with wall clock times from the
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
    // Safari (iPhone) records mp4, not webm, so take the first container the browser offers.
    const mimeType = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t))
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
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
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' })
    const clip = { url: URL.createObjectURL(blob), events: recording.events, agitation: recording.agitation, duration: CLIP_SECONDS }
    recording = null
    addClip(clip)
    storeClip({ blob, events: clip.events, agitation: clip.agitation, duration: clip.duration })
  }
  function addClip (clip) {
    clips.push(clip)
    const k = clips.length - 1
    const v = videoEl({ src: clip.url, muted: true, playsinline: true, preload: 'metadata' })
    clipList.appendChild(div({ class: current.bindAttr(() => current() === k ? 'clip on' : 'clip'), onclick: () => { current(k); for (const cell of cells) cell.video.src = clip.url } }, v, div({ class: 'readout' }, `${clip.events.length} events`)))
    current(k)
    for (const cell of cells) cell.video.src = clip.url
    status(`Clip ${k + 1}: ${clip.events.length} events (${EVENTS.map(t => `${t} ${clip.events.filter(e => e.type === t).length}`).join(', ')}).`)
  }
  // Clips survive a reload: the recording and its events go into IndexedDB (Robert: "I need to
  // be able to save my progress on the sound evolver"), and come back as the page opens.
  const db = () => new Promise((resolve, reject) => {
    const req = indexedDB.open('sound-evolution', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('clips', { autoIncrement: true })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  async function storeClip (record) {
    try { const d = await db(); d.transaction('clips', 'readwrite').objectStore('clips').add(record) } catch (e) { console.warn('clip not stored', e) }
  }
  async function restoreClips () {
    try {
      const d = await db()
      const all = await new Promise((resolve, reject) => { const r = d.transaction('clips').objectStore('clips').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
      for (const rec of all) addClip({ url: URL.createObjectURL(rec.blob), events: rec.events, agitation: rec.agitation, duration: rec.duration })
      if (all.length) status(`${all.length} clip${all.length === 1 ? '' : 's'} restored. Press Start for sound, then play the cells.`)
    } catch (e) { console.warn('clips not restored', e) }
  }
  async function forgetClips () {
    try { const d = await db(); d.transaction('clips', 'readwrite').objectStore('clips').clear() } catch (e) { /* nothing to forget */ }
    clips.length = 0
    clipList.replaceChildren()
    current(-1)
    status('Clips forgotten. Record a new one.')
  }

  // Genomes.
  const randomGenes = spec => Object.fromEntries(Object.entries(spec).map(([k, [lo, hi]]) => [k, rand(lo, hi)]))
  const fillGenes = (spec, given) => Object.fromEntries(Object.entries(spec).map(([k, [lo, hi]]) => [k, given && given[k] !== undefined ? given[k] : (lo + hi) / 2]))
  function randomVoice () {
    return {
      sample: { source: pick(SAMPLE_SOURCES), plop: Math.floor(Math.random() * Math.max(1, LIKED_PLOPS.length)), cut: Math.floor(Math.random() * LIKED_CUTS.length), ...randomGenes(SAMPLE_GENES) },
      synth: randomGenes(SYNTH_GENES)
    }
  }
  const presetVoice = type => {
    const p = PRESETS[type]
    return {
      sample: { source: p.sample.source, plop: 0, cut: 0, ...fillGenes(SAMPLE_GENES, { start: 0.3, length: 0.5, pitchBySize: -4, ...p.sample }) },
      synth: fillGenes(SYNTH_GENES, { pitchBySize: -4, ...p.synth })
    }
  }
  const randomBed = () => ({ kind: 'sample', sample: Math.floor(Math.random() * LIKED_BEDS.length), ...randomGenes(BED_GENES) })
  const presetBed = () => ({ kind: 'sample', sample: 0, ...fillGenes(BED_GENES, { gain: 0.4, follow: 0.7, cutoff: 4000, rate: 1 }) })
  const randomGenome = () => ({ voices: Object.fromEntries(EVENTS.map(t => [t, randomVoice()])), bed: randomBed() })
  const presetGenome = () => ({ voices: Object.fromEntries(EVENTS.map(t => [t, presetVoice(t)])), bed: presetBed() })
  const mutateGenes = (spec, g, rate, step = 0.12) => { for (const [k, [lo, hi]] of Object.entries(spec)) if (Math.random() < rate) g[k] = clamp(g[k] + gauss() * step * (hi - lo), lo, hi) }
  function mutateVoice (v, rate) {
    const g = { sample: { ...v.sample }, synth: { ...v.synth } }
    if (Math.random() < rate * 0.15) g.sample.source = pick(SAMPLE_SOURCES)
    if (Math.random() < rate * 0.15) g.sample.cut = Math.floor(Math.random() * LIKED_CUTS.length)
    mutateGenes(SAMPLE_GENES, g.sample, rate)
    mutateGenes(SYNTH_GENES, g.synth, rate)
    return g
  }
  function mutateBed (b, rate) {
    const g = { ...b }
    if (Math.random() < rate * 0.15) g.sample = Math.floor(Math.random() * LIKED_BEDS.length)
    mutateGenes(BED_GENES, g, rate)
    return g
  }
  const mutate = (g, rate = 0.3) => ({ voices: Object.fromEntries(EVENTS.map(t => [t, mutateVoice(g.voices[t], rate)])), bed: mutateBed(g.bed, rate) })
  // Crossover layer by layer, so a good synth can meet a good sample.
  const cross = (a, b) => ({
    voices: Object.fromEntries(EVENTS.map(t => [t, { sample: { ...(Math.random() < 0.5 ? a : b).voices[t].sample }, synth: { ...(Math.random() < 0.5 ? a : b).voices[t].synth } }])),
    bed: { ...(Math.random() < 0.5 ? a : b).bed }
  })
  const sampleName = v => v.sample.source === 'plop' ? LIKED_PLOPS[v.sample.plop] : v.sample.source === 'cut' ? `${LIKED_CUTS[v.sample.cut]} @${v.sample.start.toFixed(2)} ${v.sample.length.toFixed(2)}s` : 'no sample'
  const summary = g => EVENTS.map(t => { const v = g.voices[t]; return `${t}: ${sampleName(v)} ${v.sample.pitch >= 0 ? '+' : ''}${v.sample.pitch.toFixed(0)}st x${v.sample.stretch.toFixed(2)} g${v.sample.gain.toFixed(2)} | synth ${v.synth.low.toFixed(0)}Hz bend ${v.synth.bend.toFixed(2)} ${v.synth.length.toFixed(2)}s wob ${v.synth.wobbleDepth.toFixed(2)} wet ${v.synth.wet.toFixed(2)} g${v.synth.gain.toFixed(2)}` }).join('\n') + `\nbed: ${LIKED_BEDS[g.bed.sample]} g${g.bed.gain.toFixed(2)} follow ${g.bed.follow.toFixed(2)} lp${g.bed.cutoff.toFixed(0)} x${g.bed.rate.toFixed(2)}`

  // The gloop synth, scheduled on the audio clock: a sine at `low` (bent down by the event's
  // size) that glides to `bend` times that over `bendTime`, then to `tail` of where it got to
  // by the end, with a vibrato wobble and a second harmonic throat; a band of wet noise under
  // it; a consonant click at the start and a thud at the end.
  function playGloop (at, pan, size, strength, g) {
    const context = gloop.context
    if (!context || g.gain <= 0) return
    let out = gloop.master
    if (context.createStereoPanner) { const p = context.createStereoPanner(); p.pan.value = clamp(pan, -0.8, 0.8); p.connect(out); out = p }
    const t = at
    const f0 = g.low * Math.pow(2, g.pitchBySize * (size - 0.5) / 12)
    const level = g.gain * (0.4 + 0.6 * strength) * 0.5
    const end = t + g.length
    const osc = context.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(f0 * g.bend, t + Math.min(g.length, g.bendTime))
    osc.frequency.exponentialRampToValueAtTime(f0 * g.bend * g.tail, end)
    if (g.wobbleDepth > 0) {
      const lfo = context.createOscillator()
      lfo.frequency.value = g.wobbleRate
      const depth = context.createGain()
      depth.gain.value = f0 * g.wobbleDepth
      lfo.connect(depth); depth.connect(osc.frequency)
      lfo.start(t); lfo.stop(end + 0.05)
    }
    const env = context.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(level, t + g.attack)
    env.gain.setValueAtTime(level, t + Math.max(g.attack, g.length * 0.6))
    env.gain.exponentialRampToValueAtTime(0.0005, end)
    osc.connect(env); env.connect(out)
    osc.start(t); osc.stop(end + 0.02)
    if (g.throat > 0) {
      const osc2 = context.createOscillator()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(f0 * 2, t)
      osc2.frequency.exponentialRampToValueAtTime(f0 * 2 * g.bend, t + Math.min(g.length, g.bendTime))
      osc2.frequency.exponentialRampToValueAtTime(f0 * 2 * g.bend * g.tail, end)
      const env2 = context.createGain()
      env2.gain.setValueAtTime(0, t)
      env2.gain.linearRampToValueAtTime(level * g.throat, t + g.attack * 1.5)
      env2.gain.exponentialRampToValueAtTime(0.0005, t + g.length * 0.8)
      osc2.connect(env2); env2.connect(out)
      osc2.start(t); osc2.stop(end)
    }
    const noise = (start, seconds, lvl, type, freq, q) => {
      if (lvl <= 0 || !gloop.noiseBuffer) return
      const src = context.createBufferSource()
      src.buffer = gloop.noiseBuffer
      src.loop = true
      src.playbackRate.value = 0.5 + Math.random()
      const filter = context.createBiquadFilter()
      filter.type = type; filter.frequency.value = freq; filter.Q.value = q
      const gn = context.createGain()
      gn.gain.setValueAtTime(lvl, start)
      gn.gain.exponentialRampToValueAtTime(0.0005, start + seconds)
      src.connect(filter); filter.connect(gn); gn.connect(out)
      src.start(start); src.stop(start + seconds + 0.02)
    }
    noise(t, g.length * 0.7, level * g.wet, 'bandpass', g.wetFreq, 1.2)
    noise(t, 0.03, level * g.click, 'bandpass', 1800, 1)
    noise(end - 0.06, 0.09, level * g.thump, 'lowpass', 220, 0.7)
  }

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
    const lastAt = {}
    for (const e of clip.events) {
      const v = g.voices[e.type]
      if (!v) continue
      if (lastAt[e.type] !== undefined && e.t - lastAt[e.type] < 0.12) continue // one voice per event kind per 120 ms
      lastAt[e.type] = e.t
      const pan = e.x * 2 - 1
      const sm = v.sample
      if (sm.source === 'plop' && plops[sm.plop] && sm.gain > 0) {
        player.play(plops[sm.plop], { size: e.size, strength: 1, pan, at: t0 + e.t, settings: { pitch: sm.pitch, pitchBySize: sm.pitchBySize, stretch: sm.stretch, gain: sm.gain, start: 0, end: 1 } })
      } else if (sm.source === 'cut' && cuts[sm.cut] && sm.gain > 0) {
        const d = cuts[sm.cut].buffer.duration
        player.play(cuts[sm.cut], { size: e.size, strength: 1, pan, at: t0 + e.t, settings: { pitch: sm.pitch, pitchBySize: sm.pitchBySize, stretch: sm.stretch, gain: sm.gain, start: sm.start, end: Math.min(1, sm.start + sm.length / d) } })
      }
      playGloop(t0 + e.t, pan, e.size, e.strength ?? 1, v.synth)
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
    population = Array.from({ length: POPULATION }, () => mutate(presetGenome(), 0.6))
    showPopulation(); save()
  }
  function wildGeneration () {
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
  // Save and load the whole state as a file, for progress that outlives the browser's storage.
  function saveFile () {
    const blob = new Blob([JSON.stringify({ generation, population }, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `sound-evolution-generation-${generation}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  function loadFile () {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const file = input.files && input.files[0]
      if (!file) return
      try {
        const saved = JSON.parse(await file.text())
        if (!saved.population || saved.population.length !== POPULATION) throw new Error('not a population of sixteen')
        generation = saved.generation || 1
        population = saved.population
        showPopulation(); save()
        status(`Loaded ${file.name}: generation ${generation}.`)
      } catch (e) { status(`Could not load ${file.name}: ${e.message}`) }
    }
    input.click()
  }
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
          button({ onclick: newGeneration }, 'New generation'),
          button({ onclick: wildGeneration }, 'Wild generation'),
          button({ onclick: copyStarred }, copied.bindAs(() => copied() ? 'Copied' : 'Copy starred genomes')),
          button({ onclick: stopPlaying }, 'Stop'),
          button({ onclick: saveFile }, 'Save file'),
          button({ onclick: loadFile }, 'Load file'),
          button({ onclick: forgetClips }, 'Forget clips')
        ),
        div({ class: 'readout' }, status.bindAs(() => status())),
        p('Record a few clips of the lamp as it runs on the left (the picture, the events the detector fires, the agitation). Pick a clip, then press ▶ on a cell: the clip plays with that genome\'s sounds. Star the ones that sound right and Breed: the stars survive and the rest are their children, crossed layer by layer and mutated. Each genome is a voice per event, two layers mixed: a recording (viscous liquid fall in, or a short cut from water gloops and glops or the two good beds, pitched and stretched) and a gloop synth (a bending, wobbling sine with a throat, wet noise, a click and a thud), plus a bed (hot bubbling mud or ambient bubbling liquid following the agitation). New generation starts from a preset per event; Wild generation from uniform randomness.'),
        div({ class: 'readout' }, genLabel.bindAs(() => genLabel())),
        clipList
      )
    ),
    grid
  ))
  if (population.length) showPopulation()
  restoreClips()
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
    if (gloop.enabled) gloop.update(sim.state, sim.count, W, H, params.gravity, FRAME * defaultPace, params.interactionRadius)
    requestAnimationFrame(frame)
  }
  frame()
}
