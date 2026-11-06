// A trigger's shape, its attack and decay finer than the 17 ms frame (Robert: "impelemnt the shape for all
// of those triggers"): a band's envelope, the 1 ms RMS of its waveform kept from frame to frame, and the
// measures read from it. music.js keeps one a band; a tool's scan gives each frame its new milliseconds.

// A band's envelope over the last `memory` ms. read: the 1 ms RMS of a window's whole milliseconds not read
// before, the window's last sample being sample `end` of the stream; push: add them; at: the value `ago` ms
// back; count: the milliseconds pushed, all told (a hit's `at` is counted so, to find it again later).
export function createEnvelope (memory = 2048) {
  const ring = new Float32Array(memory)
  let count = 0
  let next = -1
  let out = new Float32Array(64)
  return {
    read (samples, rate, end) {
      const step = Math.max(1, Math.round(rate / 1000))
      const start = end - samples.length
      const first = Math.ceil(start / step), last = Math.floor(end / step)
      if (next < first || next > last) next = first
      const n = last - next
      if (out.length < n) out = new Float32Array(n)
      for (let j = 0; j < n; j++) {
        const s0 = (next + j) * step - start
        let q = 0
        for (let i = s0; i < s0 + step; i++) q += samples[i] * samples[i]
        out[j] = Math.sqrt(q / step)
      }
      next = last
      return out.subarray(0, n)
    },
    push (values) { for (let j = 0; j < values.length; j++) ring[count++ % memory] = values[j] },
    at (ago) { return ago >= 0 && ago < count && ago < memory ? ring[(count - 1 - ago) % memory] : 0 },
    get count () { return count },
    get length () { return Math.min(count, memory) },
    reset () { count = 0; next = -1 }
  }
}

// The newest hit in an envelope: its peak in the last `within` ms (ago, ms back; at, by count), the lowest
// in the `before` ms before it, how many times over that it rose, and its attack (ms from 10% to 90% of the
// way up, Infinity when it did not start from under 10%).
export function hitIn (e, within = 80, before = 30) {
  let kp = 0
  for (let k = 1; k < within; k++) if (e.at(k) > e.at(kp)) kp = k
  const peak = e.at(kp)
  let floor = Infinity
  for (let k = kp + 1; k <= kp + before; k++) floor = Math.min(floor, e.at(k))
  const hit = { peak, ago: kp, at: e.count - 1 - kp, floor, rise: peak / Math.max(1e-6, floor), attack: Infinity }
  let a10 = -1
  for (let k = kp; k <= kp + before; k++) if (e.at(k) < floor + 0.1 * (peak - floor)) { a10 = k; break }
  if (a10 < 0) return hit
  let a90 = kp
  for (let k = a10; k >= kp; k--) if (e.at(k) >= floor + 0.9 * (peak - floor)) { a90 = k; break }
  hit.attack = a10 - a90
  return hit
}

// What is left of a hit from `from` to `to` ms after its peak: the envelope's mean there over the hit's
// floor, as a share of its peak over the floor (1 held, 0 gone). Needs `to` ms after the peak heard.
export function tailOf (e, hit, from, to) {
  const ago = e.count - 1 - hit.at
  let s = 0
  for (let k = ago - to; k < ago - from; k++) s += e.at(k)
  return (s / Math.max(1, to - from) - hit.floor) / Math.max(1e-9, hit.peak - hit.floor)
}

// Triggers waiting on their tail: wait(e, hit, ms, test, fire) calls fire() once `ms` after the hit's peak
// have been heard, if test(e, hit) passes then; judge() once a frame.
export function createWaits () {
  const list = []
  return {
    wait (e, hit, ms, test, fire) { if (e.count - 1 - hit.at >= ms) { if (test(e, hit)) fire() } else list.push({ e, hit, ms, test, fire }) },
    judge () {
      for (let j = 0; j < list.length; j++) {
        const w = list[j]
        if (w.e.count - 1 - w.hit.at < w.ms) continue
        list.splice(j--, 1)
        if (w.test(w.e, w.hit)) w.fire()
      }
    },
    reset () { list.length = 0 }
  }
}
