// Every random number in the lamp comes from here, from a seeded generator (mulberry32: 32 bits
// of state, good enough spread for a lava lamp and tiny), so that a seed reproduces the whole
// lamp: the cups, the elements, every eddy and every lighting. JavaScript's Math.random cannot
// be seeded, which is why this exists (Robert: "have a global random seed. This way the entire
// layout can be made entirely consistent and predictable if the random seed is set ... we may
// need a consistent random helper, not sure what js has for this"). Unseeded, it starts from
// the clock.
let state = (Date.now() ^ 0x9e3779b9) >>> 0

export function seedRandom (seed) {
  state = (Number(seed) >>> 0)
}

// Real number in [0, 1).
export function random () {
  state = (state + 0x6D2B79F5) >>> 0
  let t = state
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// Integer in [min, max).
export const randomBetween = (min, max) => Math.trunc(random() * (max - min) + min)

// Real number in [min, max).
export const randomRange = (min, max) => random() * (max - min) + min

// Standard normal (mean 0, deviation 1), Box-Muller.
export const randomNormal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())

// Integer drawn from a bell curve squeezed into [min, max). skew > 1 leans the curve toward min,
// skew < 1 toward max. Box-Muller, resampled when it lands outside the range.
// The result is truncated to a whole number, so a call like (0.25, 2.75) really yields 0, 1 or 2.
// The heat model was tuned against that, so it stays.
export function randomNormalDistribution (min, max, skew = 1) {
  let u = 0
  let v = 0
  while (u === 0) u = random()
  while (v === 0) v = random()
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  num = num / 10.0 + 0.5
  if (num > 1 || num < 0) return randomNormalDistribution(min, max, skew)
  num = Math.pow(num, skew)
  num *= max - min
  num += min
  return Math.trunc(num)
}
