// The parts of a song around a drop, heard from the analyser's spectrum frame by frame (Robert:
// "all those additions sound great, let's just yolo and add them all. vibes forever"):
//
//   roll     a snare roll: sustained fast snare hits, usually speeding up into the drop. A snare hit
//            is a jump in its body (ROLL_BODY) and its rattle (ROLL_RATTLE) together, which a hat
//            (rattle only) and a kick (body only) are not. The roll is on while ROLL_RATE hits a
//            second or more have run ROLL_HOLD; `roll` is its rate as 0 to 1 (ROLL_FULL hits a
//            second is 1), `rollEnd` the frame it stops, which is where the drop usually lands.
//   impact   a crash or an impact on the one: the top (IMPACT_BAND) jumping IMPACT_RISE over its
//            last IMPACT_BEFORE and the whole spectrum IMPACT_TOTAL with it.
//   riser    a riser or a filter sweep: the brightness (the centroid over RISER_BAND) climbing
//            RISER_OCTAVES in RISER_WINDOW, most steps up, while the level does not fall. `riser` is
//            how far it has climbed, 0 to 1.
//   half     the drums at half time (or double): the beat's spacing over the last HALF_NEW beats
//            twice (or half) what it was before, steady both sides. music.js's tempo switch leaves
//            these out on purpose, as the same tempo.
//   key      a key change, the last chorus lifted: the pitch classes of the last KEY_SHORT seconds
//            matching those of the KEY_LONG before them shifted up 1 to 3 semitones much better
//            than unshifted.
//
//   solo     a guitar solo, or any lead out front: the mids and presence (SOLO_BAND) SOLO_RISE dB
//            over their own SOLO_SLOW mean for SOLO_HOLD, the bass not rising with them (a whole
//            band getting louder is a section, not a solo). Measured on the solos Robert named,
//            against the rest of each song's busy parts: Enter Sandman 2:58 to 3:30, mids up 2.9 dB
//            and presence 2.5; Killing in the Name 3:50 to 4:15, 4.5 and 3.7; the bass level the same.
//            `solo` is 0 to 1, `soloStart` its first frame, `leadNote` each attack in the lead's band.
//   drums    a drum solo or a big fill: hits in the drums' body (DRUM_BAND, toms and snare) at
//            DRUM_RATE a second or more for DRUM_HOLD with no lead out front. `drums` is 0 to 1,
//            `drumHit` each hit while it lasts.
//   sub      the bass shaker's input: the level of the sub bass (SUB_BAND, 0 to 1 against its own
//            recent loudest, SUB_RANGE dB under it is 0) and its pitch, the band's centroid.
//
// Each is a flag for the one frame it happens on (roll, riser and the rates stay on while they
// last), for app.js to answer.

const ROLL_BODY = [150, 350]
const ROLL_RATTLE = [2000, 6000]
const ROLL_BODY_RISE = 4 // dB over the lowest of the last ROLL_FRAMES frames
const ROLL_RATTLE_RISE = 6
const ROLL_FRAMES = 3
const ROLL_DEBOUNCE = 0.04 // s: one hit
const ROLL_RATE = 6 // hits a second
const ROLL_HOLD = 0.75 // s
const ROLL_FULL = 16
const ROLL_QUIET = 0.35 // s without a hit and the roll is over

const IMPACT_BAND = [6000, 12000]
const IMPACT_RISE = 14
const IMPACT_TOTAL = 6
const IMPACT_BEFORE = 0.3
const IMPACT_DEBOUNCE = 0.25

const RISER_BAND = [500, 12000]
const RISER_WINDOW = 2 // s
const RISER_OCTAVES = 0.6
const RISER_UP_SHARE = 0.7
const RISER_STEP = 0.1 // s between brightness samples
const RISER_FULL = 1.5 // octaves for a riser at 1

const HALF_NEW = 4 // beats
const HALF_BEFORE = 6
const HALF_AGREE = 0.15
const HALF_WAIT = 4 // s between two calls of the same switch

const KEY_SHORT = 3 // s
const KEY_LONG = 10
const KEY_STEP = 0.5 // s between looks
const KEY_GAIN = 0.12 // the shifted match over the unshifted
const KEY_MATCH = 0.82
const KEY_WAIT = 8 // s

const SOLO_BAND = [500, 5000]
const SOLO_BASS = [40, 150]
const SOLO_FAST = 1.5 // s
const SOLO_SLOW = 20 // s
const SOLO_RISE = 2 // dB
const SOLO_HOLD = 2 // s
const SOLO_BASS_RISE = 1.5 // dB the bass may rise with it
const NOTE_RISE = 5 // dB over the lowest of the last NOTE_FRAMES frames
const NOTE_FRAMES = 4
const NOTE_DEBOUNCE = 0.08 // s

const DRUM_BAND = [80, 400]
const DRUM_RISE = 6 // dB over the lowest of the last DRUM_FRAMES frames
const DRUM_FRAMES = 3
const DRUM_DEBOUNCE = 0.06
const DRUM_RATE = 5 // hits a second
const DRUM_HOLD = 1.5
const DRUM_FULL = 12

const SUB_BAND = [20, 80]
const SUB_RANGE = 18 // dB
const SUB_FALL = 3 // dB a second the loudest falls

const db = p => 10 * Math.log10(p + 1e-12)

export function createSections () {
  const body = []
  const rattle = []
  const hits = []
  let lastHit = -1e9
  let rollSince = -1
  let rollWas = false
  const top = []
  const total = []
  let lastImpact = -1e9
  const bright = []
  let lastBright = -1e9
  const beats = []
  let lastHalf = -1e9
  let tempoWas = 0
  const chroma = new Float32Array(12)
  const keyFrames = []
  let lastKeyLook = -1e9
  let lastKey = -1e9
  let subPeak = -120
  let leadFast = null, leadSlow = null, bassFast = null, bassSlow = null, soloSince = -1, soloWas = false, lastNote = -1e9
  const lead = []
  const drum = [], drumHits = []
  let lastDrum = -1e9, drumSince = -1
  const out = { drums: 0, drumHit: false, solo: 0, soloStart: false, leadNote: false, sub: 0, subHz: 0, roll: 0, rolling: false, rollEnd: false, impact: false, riser: 0, rising: false, half: false, double: false, key: false, keyShift: 0 }

  const meanOf = (list, from) => { let s = 0, n = 0; for (const [t, v] of list) if (t >= from) { s += Math.pow(10, v / 10); n++ } return n ? db(s / n) : -120 }

  return {
    get state () { return out },
    reset () {
      body.length = rattle.length = hits.length = top.length = total.length = bright.length = beats.length = keyFrames.length = 0
      lastHit = lastImpact = lastBright = lastHalf = lastKeyLook = lastKey = -1e9
      rollSince = -1; rollWas = false; tempoWas = 0; subPeak = -120; leadFast = leadSlow = bassFast = bassSlow = null; soloSince = -1; soloWas = false; lastNote = -1e9; lead.length = 0; drum.length = drumHits.length = 0; lastDrum = -1e9; drumSince = -1
    },
    // power: the analyser's band power helper (music.js), bins and binHz for the pitch classes.
    update (clock, power, bins, binHz, beat, totalPower) {
      out.rollEnd = false; out.impact = false; out.half = false; out.double = false; out.key = false

      // The solo: the lead's band over its own long mean, the bass not with it.
      {
        const l = db(power(SOLO_BAND)), bb = db(power(SOLO_BASS))
        const dt = 1 / 60
        leadFast = leadFast === null ? l : leadFast + (l - leadFast) * Math.min(1, dt / SOLO_FAST)
        leadSlow = leadSlow === null ? l : leadSlow + (l - leadSlow) * Math.min(1, dt / SOLO_SLOW)
        bassFast = bassFast === null ? bb : bassFast + (bb - bassFast) * Math.min(1, dt / SOLO_FAST)
        bassSlow = bassSlow === null ? bb : bassSlow + (bb - bassSlow) * Math.min(1, dt / SOLO_SLOW)
        const over = leadFast - leadSlow
        const on = clock > SOLO_SLOW / 2 && over > SOLO_RISE && bassFast - bassSlow < SOLO_BASS_RISE
        if (on) { if (soloSince < 0) soloSince = clock } else soloSince = -1
        const soloing = soloSince >= 0 && clock - soloSince >= SOLO_HOLD
        out.solo = soloing ? Math.max(0.2, Math.min(1, (over - SOLO_RISE) / 3 + 0.2)) : 0
        out.soloStart = soloing && !soloWas
        soloWas = soloing
        lead.push(l)
        if (lead.length > NOTE_FRAMES + 1) lead.shift()
        out.leadNote = false
        if (soloing && lead.length > NOTE_FRAMES && l - Math.min(...lead.slice(0, -1)) > NOTE_RISE && clock - lastNote > NOTE_DEBOUNCE) { out.leadNote = true; lastNote = clock }
      }

      // The drums: fast hits in the body band, with no lead out front.
      {
        const d = db(power(DRUM_BAND))
        drum.push(d)
        if (drum.length > DRUM_FRAMES + 1) drum.shift()
        let hit = false
        if (drum.length > DRUM_FRAMES && d - Math.min(...drum.slice(0, -1)) > DRUM_RISE && clock - lastDrum > DRUM_DEBOUNCE) { hit = true; lastDrum = clock; drumHits.push(clock) }
        while (drumHits.length && clock - drumHits[0] > 1) drumHits.shift()
        if (drumHits.length >= DRUM_RATE && out.solo === 0) { if (drumSince < 0) drumSince = clock } else if (clock - lastDrum > 0.4 || out.solo > 0) drumSince = -1
        const drumming = drumSince >= 0 && clock - drumSince >= DRUM_HOLD
        out.drums = drumming ? Math.min(1, drumHits.length / DRUM_FULL) : 0
        out.drumHit = drumming && hit
      }

      // The sub bass, for the shaker.
      {
        const a = Math.max(1, Math.floor(SUB_BAND[0] / binHz)), z = Math.max(a, Math.min(bins.length - 1, Math.ceil(SUB_BAND[1] / binHz)))
        let w = 0, sum = 0
        for (let k = a; k <= z; k++) { const p = Math.pow(10, (bins[k] - 255) * 8 / 255); w += p * k; sum += p }
        const level = db(sum / (z - a + 1))
        subPeak = Math.max(level, subPeak - SUB_FALL / 60)
        out.sub = Math.max(0, Math.min(1, (level - (subPeak - SUB_RANGE)) / SUB_RANGE))
        out.subHz = sum > 0 ? Math.max(SUB_BAND[0], Math.min(SUB_BAND[1], w / sum * binHz)) : 0
      }

      // The snare roll.
      const b = db(power(ROLL_BODY)), r = db(power(ROLL_RATTLE))
      body.push(b); rattle.push(r)
      if (body.length > ROLL_FRAMES + 1) { body.shift(); rattle.shift() }
      if (body.length > ROLL_FRAMES) {
        const lowB = Math.min(...body.slice(0, -1)), lowR = Math.min(...rattle.slice(0, -1))
        if (b - lowB > ROLL_BODY_RISE && r - lowR > ROLL_RATTLE_RISE && clock - lastHit > ROLL_DEBOUNCE) { hits.push(clock); lastHit = clock }
      }
      while (hits.length && clock - hits[0] > 1) hits.shift()
      const rate = hits.length
      if (rate >= ROLL_RATE) { if (rollSince < 0) rollSince = clock } else if (clock - lastHit > ROLL_QUIET) rollSince = -1
      out.rolling = rollSince >= 0 && clock - rollSince >= ROLL_HOLD
      out.roll = out.rolling ? Math.min(1, rate / ROLL_FULL) : 0
      if (rollWas && !out.rolling) out.rollEnd = true
      rollWas = out.rolling

      // The impact.
      const tp = db(power(IMPACT_BAND)), tt = db(totalPower)
      const topBefore = meanOf(top, clock - IMPACT_BEFORE), totalBefore = meanOf(total, clock - IMPACT_BEFORE)
      if (top.length > 5 && tp - topBefore > IMPACT_RISE && tt - totalBefore > IMPACT_TOTAL && clock - lastImpact > IMPACT_DEBOUNCE) { out.impact = true; lastImpact = clock }
      top.push([clock, tp]); total.push([clock, tt])
      while (top.length && clock - top[0][0] > IMPACT_BEFORE) top.shift()
      while (total.length && clock - total[0][0] > IMPACT_BEFORE) total.shift()

      // The riser.
      if (clock - lastBright >= RISER_STEP) {
        lastBright = clock
        const a = Math.max(1, Math.floor(RISER_BAND[0] / binHz)), z = Math.min(bins.length - 1, Math.ceil(RISER_BAND[1] / binHz))
        let w = 0, s = 0
        for (let k = a; k <= z; k++) { const p = Math.pow(10, (bins[k] - 255) * 8 / 255); w += p * k; s += p }
        bright.push([clock, s > 0 ? Math.log2(w / s * binHz) : 0, db(totalPower)])
        while (bright.length && clock - bright[0][0] > RISER_WINDOW) bright.shift()
      }
      out.rising = false; out.riser = 0
      if (bright.length >= RISER_WINDOW / RISER_STEP * 0.9) {
        const climb = bright[bright.length - 1][1] - bright[0][1]
        let up = 0
        for (let k = 1; k < bright.length; k++) if (bright[k][1] > bright[k - 1][1]) up++
        const louder = bright[bright.length - 1][2] >= bright[0][2] - 1
        if (climb > RISER_OCTAVES && up >= RISER_UP_SHARE * (bright.length - 1) && louder) { out.rising = true; out.riser = Math.min(1, climb / RISER_FULL) }
      }

      // Half time and double time.
      if (beat) {
        beats.push(clock)
        while (beats.length > HALF_NEW + HALF_BEFORE + 1) beats.shift()
        if (beats.length === HALF_NEW + HALF_BEFORE + 1) {
          const gaps = beats.slice(1).map((t, k) => t - beats[k])
          const before = gaps.slice(0, HALF_BEFORE), now = gaps.slice(HALF_BEFORE)
          const mean = g => g.reduce((x, y) => x + y, 0) / g.length
          const steady = g => { const m = mean(g); return g.every(x => Math.abs(x - m) <= HALF_AGREE * m) }
          if (steady(before) && steady(now)) {
            const ratio = mean(now) / mean(before)
            const tempo = Math.abs(ratio - 2) < 0.2 ? 2 : Math.abs(ratio - 0.5) < 0.1 ? 0.5 : 1
            if (tempo !== 1 && tempo !== tempoWas && clock - lastHalf > HALF_WAIT) { if (tempo === 2) out.half = true; else out.double = true; lastHalf = clock }
            tempoWas = tempo === 1 ? tempoWas : tempo
          }
        }
      }

      // The key change.
      chroma.fill(0)
      const lo = Math.max(1, Math.floor(110 / binHz)), hi = Math.min(bins.length - 1, Math.ceil(1760 / binHz))
      for (let k = lo; k <= hi; k++) {
        const f = k * binHz
        const pc = ((Math.round(12 * Math.log2(f / 440)) + 9) % 12 + 12) % 12
        chroma[pc] += Math.pow(10, (bins[k] - 255) * 8 / 255)
      }
      keyFrames.push([clock, Float32Array.from(chroma)])
      while (keyFrames.length && clock - keyFrames[0][0] > KEY_SHORT + KEY_LONG) keyFrames.shift()
      out.keyShift = 0
      if (clock - lastKeyLook >= KEY_STEP && keyFrames.length && clock - keyFrames[0][0] >= KEY_SHORT + KEY_LONG * 0.9 && clock - lastKey > KEY_WAIT) {
        lastKeyLook = clock
        const shortP = new Float32Array(12), longP = new Float32Array(12)
        for (const [t, c] of keyFrames) { const into = clock - t <= KEY_SHORT ? shortP : longP; for (let j = 0; j < 12; j++) into[j] += c[j] }
        const norm = v => { const m = Math.sqrt(v.reduce((x, y) => x + y * y, 0)) || 1; return v.map(x => x / m) }
        const S = norm(shortP), L = norm(longP)
        const match = shift => { let d = 0; for (let j = 0; j < 12; j++) d += S[(j + shift) % 12] * L[j]; return d }
        const still = match(0)
        let best = 0, bestMatch = still
        for (const shift of [1, 2, 3]) { const m = match(shift); if (m > bestMatch) { best = shift; bestMatch = m } }
        if (best && bestMatch > KEY_MATCH && bestMatch - still > KEY_GAIN) { out.key = true; out.keyShift = best; lastKey = clock }
      }
      return out
    }
  }
}
