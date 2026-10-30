// Integer in [min, max).
export const randomBetween = (min, max) => Math.trunc(Math.random() * (max - min) + min)

// Real number in [min, max).
export const randomRange = (min, max) => Math.random() * (max - min) + min

// Standard normal (mean 0, deviation 1), Box-Muller.
export const randomNormal = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())

// Integer drawn from a bell curve squeezed into [min, max). skew > 1 leans the curve toward min,
// skew < 1 toward max. Box-Muller, resampled when it lands outside the range.
// The result is truncated to a whole number, so a call like (0.25, 2.75) really yields 0, 1 or 2.
// The heat model was tuned against that, so it stays.
export function randomNormalDistribution (min, max, skew = 1) {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  num = num / 10.0 + 0.5
  if (num > 1 || num < 0) return randomNormalDistribution(min, max, skew)
  num = Math.pow(num, skew)
  num *= max - min
  num += min
  return Math.trunc(num)
}
