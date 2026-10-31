// The pinch lab: one blob, one heat pulse, nothing random, drawn as a black silhouette on orange
// like the video Robert found of a real lamp (youtube 27ccYiw9RBs). Robert: "could we make a
// single simulation version that was not random and reproduced that snap in the video? That'd
// inform us on the properties of the liquid we need to get it right". Knobs for the liquid,
// Replay, and a filmstrip of frames at a fixed interval after the pulse, to lay beside the stills.
import { button, div, fnstate, option, select, span } from '@srfnstack/fntags'
import { createSimulation } from '../src/sim/simulation.js'
import { seedRandom } from '../src/sim/random.js'
import { createRenderer } from '../src/render/renderer.js'
import { DECADES, hint, knob, knobs, row, segmented, toggle } from '../src/ui/components.js'
import { defaultHeatColors } from '../src/ui/settings.js'

const W = 360
const H = 900
const FRAME = 1 / 60
const SEED = 1

export function start () {
  // The liquid.
  const wobble = fnstate(0.46)
  const kick = fnstate(1.6)
  const cap = fnstate(3.4)
  // Robert's liquid, pasted from Copy settings on 2026-10-30 ("this one is by FAR the best one yet"):
  // 3050 particles at radius 20 drawn at size 3 with Smooth 3 ("size 3, smooth 3 looks fucking amazing"); Stiff 7.5 against Density 360, so
  // the pull is a near constant cohesion; Gloop 0.7, so a lump warms as one; Skin 300, so every
  // particle carries its pressure move as velocity, the paper's own velocity; Max heat 6200.
  const stiffness = fnstate(7.5)
  const near = fnstate(1101)
  const density = fnstate(360.1)
  const gloop = fnstate(0.7)
  // Half the lamp's grain, at Robert's suggestion: "maybe we need a smaller particle size? that
  // should be fine now that we have a much faster render". Same lava, four times the particles.
  const radius = fnstate(20)
  const settle = fnstate(1) // relaxation passes a frame
  const viscosity = fnstate(32) // the paper's sigma
  // Physics steps per 60 Hz frame. Finer grain needs them: at half the radius the same frame moves
  // particles twice as many spacings, and the pressure step over corrects; at radius 15 with four
  // times the particles one step a frame left the lava in droplets and sheets, two steps a frame
  // pinched with a neck that lived 2.4 s (the video's 2.4 s). Each step costs the whole physics again.
  const substeps = fnstate(1)
  const reach = fnstate(1) // the most a relaxation step may move a particle, in radii; the check that keeps high Density from exploding
  const wall = fnstate(0) // px from a side wall within which lava is eased away from it; the walls also take the momentum carried into them
  const skin = fnstate(300) // a particle counts as skin, and takes the kick, below this fraction of the lava's mean density; 0 is the lamp's rule, pressure below zero
  const size = fnstate(3)
  const smooth = fnstate(3) // edge smoothing radius, px
  // The experiment. Robert, on the first strip: "the blob go too hot and stuck to the ceiling and
  // had too much momentum taking off from the initial heating. maybe warm the whole bottom first,
  // then gently pulse the heat until it takes off". So: the lamp's own floor heater runs for Warm
  // seconds, then a finger on the floor's middle pulses for Pulse seconds every Gap seconds at Heat,
  // and Max heat caps the temperature (rise speed is temperature minus gravity, 500).
  const count = fnstate(3050)
  const warm = fnstate(6) // seconds of whole-floor heating before the pulses
  const pulse = fnstate(3.2) // seconds of finger heat per pulse
  const gap = fnstate(1.7) // seconds between pulses
  const heat = fnstate(48) // finger heat per step
  const finger = fnstate(45) // radius of the heat finger, px (the lamp's is 12% of its shorter side)
  const maxHeat = fnstate(6200)
  const interval = fnstate(0.6) // seconds between filmstrip frames
  const frames = fnstate(12)
  const from = fnstate(14) // the filmstrip starts itself at this time after a Replay
  const slow = fnstate(false)
  // Silhouette is black on orange like the video, Lamp the lamp's own colours and lighting, Heat the heat map.
  const view = fnstate('heat')
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
  let lastReadout = -1
  let measured = 0
  let capturing = false

  function params () {
    return {
      // Substeps shrink the relaxation's move by dt squared, so the pressure correction per frame
      // would weaken by the substep count; scaling the stiffnesses up by it keeps the liquid.
      particleCount: count(), interactionRadius: radius(), stiffness: stiffness() * Math.max(1, Math.round(substeps())), stiffnessNear: near() * Math.max(1, Math.round(substeps())), restDensity: density(),
      maxTemp: maxHeat(), gravity: 500, particleSize: size(), stir: 0, conduction: gloop(), turbulence: 0, drifters: 0, heatSpots: 0, cupDepth: 0,
      wobble: wobble(), wobbleKick: kick(), wobbleMax: cap(), heater: time < warm(), touchHeat: heat(), touchRadius: finger(), settle: Math.max(1, Math.round(settle())), viscosity: viscosity(), reach: reach(), wallPush: wall(), kickBelow: skin()
    }
  }

  // Every knob, the view and slow motion as one line of JSON (Robert: "add a copy settings to
  // clipboard button in the lab so I can share tweaks with you easier next time").
  const copied = fnstate(false)
  const states = {
    wobble, kick, cap, gloop, stiff: stiffness, near, density, radius, settle, viscosity, substeps, reach, wall, skin,
    lava: count, warm, pulse, gap, heat, finger, maxHeat, size, smooth, from, every: interval, frames,
    view, slow
  }
  function settings () {
    const out = {}
    for (const k in states) out[k] = states[k]()
    return out
  }
  function apply (saved) {
    for (const k in states) if (k in saved) states[k](saved[k])
  }

  // Every change is saved to local storage, in versions (Robert: "let's make all changes saved to
  // local state so I never lose my settings. let's add versioning there too, so instead of clear,
  // we create a new version from defaults"). The store is { versions: [{ name, created, settings }],
  // current }. The knobs always edit the current version; New version starts one from the defaults
  // written in this file, Copy version starts one from the current knobs.
  const STORE = 'pinch-lab-versions'
  const DEFAULTS = settings()
  const store = fnstate(loadStore())
  let applying = false
  function loadStore () {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE))
      if (saved && Array.isArray(saved.versions) && saved.versions.length) return saved
    } catch (e) { /* unreadable: start over */ }
    return { versions: [{ name: 'v1', created: Date.now(), settings: { ...DEFAULTS } }], current: 0 }
  }
  function saveStore () { localStorage.setItem(STORE, JSON.stringify(store())) }
  function currentVersion () { return store().versions[store().current] }
  function useVersion (index) {
    const s = store()
    s.current = index
    applying = true
    apply(s.versions[index].settings)
    applying = false
    store({ ...s })
    saveStore()
    reset()
  }
  function newVersion (from) {
    const s = store()
    s.versions.push({ name: `v${s.versions.length + 1}`, created: Date.now(), settings: { ...from } })
    useVersion(s.versions.length - 1)
  }
  for (const k in states) {
    states[k].subscribe(() => {
      if (applying) return
      currentVersion().settings = settings()
      saveStore()
    })
  }
  applying = true
  apply(currentVersion().settings)
  applying = false
  const when = t => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const versionPicker = () => select(
    { id: 'version', onchange: e => useVersion(Number(e.target.value)) },
    ...store().versions.map((v, i) => option({ value: String(i), selected: i === store().current }, `${v.name} · ${when(v.created)}`))
  )
  function copySettings () {
    navigator.clipboard.writeText(JSON.stringify(settings())).then(() => {
      copied(true)
      setTimeout(() => copied(false), 1500)
    })
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
      const n = Math.max(1, Math.round(substeps()))
      for (let s = 0; s < n; s++) sim.step(FRAME / n)
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
    // The pool's measured density against the rest density, from the pressures of the last step
    // (density = rest + p / stiffness), so a Density or Near the pool cannot reach shows as a gap
    // (Robert, at a gas of specks: "Not sure exactly what that relationship is").
    if (time - lastReadout >= 0.5) {
      lastReadout = time
      let sum = 0
      for (let i = 0; i < sim.count; i++) sum += sim.state.p[i]
      measured = density() + sum / sim.count / live.stiffness
    }
    clock.textContent = `${time.toFixed(1)} s · density ${measured.toFixed(1)} of ${density()}`
    requestAnimationFrame(frame)
  }

  const panel = div(
    { class: 'panel' },
    button({ class: help.bindAttr(() => help() ? 'panel-close panel-help on' : 'panel-close panel-help'), onclick: () => help(!help()), title: 'What the knobs do' }, '?'),
    div({ class: 'panel-section' }, div({ class: 'panel-section-title plain' }, span('Liquid')),
      knobs(
        knob('Wobble', 'wobble', wobble, { min: 0, max: 1, step: 0.02, scales: DECADES }, () => 0.46, v => `${v} s`),
        knob('Kick', 'kick', kick, { min: 0, max: 3, step: 0.1, scales: DECADES }, () => 1.6),
        knob('Cap', 'cap', cap, { min: 0.5, max: 5, step: 0.1, scales: DECADES }, () => 3.4, v => `${v} g`),
        knob('Gloop', 'gloop', gloop, { min: 0, max: 1, step: 0.01, scales: DECADES }, () => 0.7, v => Number(v).toFixed(4))
      ),
      hint(help, [
        ['Wobble', 'inertia: seconds for a particle to ease onto its drift. 0 is the overdamped wax with no snap at all.'],
        ['Kick', 'how much of the surface tension pull on a stretched neck or a blob skin is carried on as velocity.'],
        ['Cap', 'the fastest that carried velocity may get, in gravities.'],
        ['Gloop', 'heat conduction between touching particles: high is lava that warms and lifts as one piece.']
      ]),
      knobs(
        knob('Stiff', 'stiff', stiffness, { min: 1, max: 6500, step: 1, scales: DECADES }, () => 7.5),
        knob('Near', 'near', near, { min: 1, max: 10000, step: 1, scales: DECADES }, () => 1101),
        knob('Density', 'density', density, { min: 0.1, max: 15, step: 0.1, scales: DECADES }, () => 360.1, v => Number(v).toFixed(1)),
        knob('Radius', 'radius', radius, { min: 2, max: 100, step: 1, scales: DECADES }, () => 20)
      ),
      knobs(
        knob('Settle', 'settle', settle, { min: 1, max: 3, step: 1, scales: DECADES }, () => 1),
        knob('Viscosity', 'viscosity', viscosity, { min: 0, max: 60, step: 1, scales: DECADES }, () => 32),
        knob('Substeps', 'substeps', substeps, { min: 1, max: 4, step: 1, scales: DECADES }, () => 1),
        knob('Reach', 'reach', reach, { min: 0.1, max: 2, step: 0.01, scales: DECADES }, () => 1, v => `${Number(v).toFixed(2)} r`),
        knob('Wall', 'wall', wall, { min: 0, max: 50, step: 1, scales: DECADES }, () => 0, v => `${v} px`),
        knob('Skin', 'skin', skin, { min: 0, max: 1, step: 0.01, scales: DECADES }, () => 300, v => Number(v).toFixed(2))
      ),
      hint(help, [
        ['Stiff', 'pressure pushing particles apart when they crowd past the rest density.'],
        ['Near', 'the short range push that stops particles stacking; also the surface tension.'],
        ['Density', 'the rest density the pressure aims for: lower is a looser, more stretchy liquid.'],
        ['Radius', 'how far a particle feels its neighbours, in pixels.'],
        ['Settle', 'pressure passes per frame. 1 is the lamp; 2 spaces the particles more evenly so the skin is less bumpy to begin with.'],
        ['Viscosity', 'how much neighbours slow each other as they close in (the paper\'s sigma): necks thin and tails pull in more slowly. Needs Wobble above 0.'],
        ['Reach', 'the most the pressure step may move a particle, in radii. Low keeps a high Density from flying apart; the lamp runs at 1.'],
        ['Wall', 'lava this close to a side wall is eased away from it, px, a glass the wax does not wet. The walls also absorb the momentum carried into them, at any setting.'],
        ['Skin', 'which particles count as skin and take the Kick: those below this fraction of the lava\'s mean density. 0 is the lamp\'s rule, pressure below zero, which in this liquid is every particle, so the cold pool churned and climbed.'],
        ['Substeps', 'physics steps per frame. Finer grain (smaller Radius, more Lava) needs 2 or more or the lava breaks into droplets; each one costs the whole physics again.']
      ])),
    div({ class: 'panel-section' }, div({ class: 'panel-section-title plain' }, span('Experiment')),
      knobs(
        knob('Lava', 'count', count, { min: 50, max: 50000, step: 50, scales: DECADES }, () => 3050),
        knob('Warm', 'warm', warm, { min: 0, max: 20, step: 0.5, scales: DECADES }, () => 6, v => `${v} s`),
        knob('Pulse', 'pulse', pulse, { min: 0.1, max: 4, step: 0.1, scales: DECADES }, () => 3.2, v => `${v} s`),
        knob('Gap', 'gap', gap, { min: 0.1, max: 6, step: 0.1, scales: DECADES }, () => 1.7, v => `${v} s`)
      ),
      hint(help, [
        ['Lava', 'particles in the pool. The blob is cut from these, so more lava is a bigger blob or a second one.'],
        ['Warm', 'seconds the whole floor heats like a real lamp base before any pulse, so the pool starts warm and soft.'],
        ['Pulse', 'seconds each heat pulse lasts: a finger on Heat held at the middle of the floor.'],
        ['Gap', 'seconds between pulses. They repeat until you Replay, so a blob keeps coming.']
      ]),
      knobs(
        knob('Heat', 'heat', heat, { min: 1, max: 30, step: 1, scales: DECADES }, () => 48),
        knob('Max heat', 'maxHeat', maxHeat, { min: 500, max: 3000, step: 10, scales: DECADES }, () => 6200),
        knob('Finger', 'finger', finger, { min: 5, max: 180, step: 1, scales: DECADES }, () => 45, v => `${v} px`),
        knob('Size', 'size', size, { min: 1, max: 50, step: 1, scales: DECADES }, () => 3),
        knob('Smooth', 'smooth', smooth, { min: 0, max: 24, step: 1, scales: DECADES }, () => 3)
      ),
      hint(help, [
        ['Heat', 'how hard each pulse heats: temperature added per frame under the finger. 12 is the lamp\'s touch.'],
        ['Max heat', 'the hottest lava can get. Rise speed is heat minus gravity (500), so 800 is a blob that climbs at 300 px/s at most and cools before the ceiling.'],
        ['Size', 'the drawn radius of a particle, in pixels. Mostly the look; it also sets how close to the floor counts as touching the heater. For finer lava, halve Size and Radius and use four times the Lava.'],
        ['Smooth', 'edge smoothing: the lava field is blurred by this many pixels before the edge is cut, which rounds off the bumps of the particles. 0 is the raw metaballs.']
      ]),
      knobs(
        knob('From', 'from', from, { min: 0, max: 30, step: 0.5, scales: DECADES }, () => 14, v => `${v} s`),
        knob('Every', 'interval', interval, { min: 0.1, max: 2, step: 0.1, scales: DECADES }, () => 0.6, v => `${v} s`),
        knob('Frames', 'frames', frames, { min: 4, max: 24, step: 1, scales: DECADES }, () => 12)
      ),
      hint(help, [
        ['Finger', 'radius of the heat pulse on the floor, in px: how much lava one pulse warms, so how big a lump lifts.'],
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
      clock),
    div({ class: 'actions' },
      button({ id: 'copy', onclick: copySettings }, copied.bindAs(() => copied() ? 'Copied' : 'Copy settings'))),
    hint(help, 'Copy settings puts every knob, the view and slow motion on the clipboard as one line of JSON, to paste into a chat or a log.'),
    div({ class: 'panel-section' }, div({ class: 'panel-section-title plain' }, span('Versions')),
      row('Version', store.bindAs(versionPicker)),
      div({ class: 'actions' },
        button({ id: 'new-version', onclick: () => newVersion(DEFAULTS) }, 'New from defaults'),
        button({ id: 'copy-version', onclick: () => newVersion(settings()) }, 'Copy version')),
      hint(help, 'Every knob change is saved in the browser, in the version shown. New from defaults starts a fresh version at the lab\'s built in settings; Copy version starts one from the knobs as they are. Older versions stay in the list.'))
  )

  // Lamp, knobs, then the filmstrip, so the strip filling in never moves the knobs (Robert: "it's
  // annoying when it loads and moves the controls").
  document.body.append(div({ class: 'lab' }, lamp, panel, strip))
  reset()
  frame()
}
