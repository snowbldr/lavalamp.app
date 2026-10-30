import { randomNormalDistribution } from './random.js'

// The lamp was tuned in a window 1000px tall. Per-frame rates scale from there so that a blob's
// rise and fall takes the same number of frames at any height. Max temperature and gravity already
// scale with height; cooling used to scale the other way, which is why small screens cycled too fast.
export const REFERENCE_HEIGHT = 1000

// Particles below this fraction of the height are over the heater.
export const HEAT_ZONE = 0.8

// Temperature is in the same units as vertical velocity, pixels per second. A particle rises exactly
// as fast as it is hot and gravity pulls it down at a fixed rate, so neutral buoyancy is temp == gravity.
// That is the overdamped (Stokes) regime, which is the right one for wax in oil.
//
// Heating is effectively contact heating. The 1/distance term is swamped by cooling everywhere except
// within a few pixels of the floor, where the squared bonus for touching takes over.
// `power` scales the heater, 0 to 1. The lamp warms up from 0 after a fill so lift off staggers.
export function nextTemperature (temp, y, height, maxTemp, particleSize, power = 1) {
  if (temp > 0) {
    temp -= randomNormalDistribution(0.25, 2.75, 1.8) * (height / REFERENCE_HEIGHT)
  }
  if (y > height * HEAT_ZONE && temp < maxTemp) {
    const distanceFromHeater = Math.max(1, height - y)
    const increase = randomNormalDistribution(0, 5) / distanceFromHeater * power
    temp += increase
    if (y > height - particleSize) {
      temp += increase * increase
    }
  }
  if (temp > maxTemp) return maxTemp
  if (temp < 0) return 0
  return temp
}

// Heating while the lamp warms up after a fill. Contact heating only warms the bottom layer of a
// slab, and hot bottom particles pop up through the cold layers above one at a time, so the first
// thing to lift is droplets. A real lamp's first glob is a whole bulge going buoyant together, so
// during warm up the heat reaches `depth` particle sizes up into the lava with a linear falloff.
// `power` is the heater power at this x, 0 to 1.
// `shape` is the vertical profile: 1 falls off linearly to zero at `depth`, 0 is flat all the way
// up so a whole column of the slab goes buoyant together and detaches as one glob.
export function warmupTemperature (temp, y, height, maxTemp, particleSize, power, depth, gain, shape) {
  if (temp > 0) {
    temp -= randomNormalDistribution(0.25, 2.75, 1.8) * (height / REFERENCE_HEIGHT)
  }
  const reach = depth * particleSize
  const above = height - y
  if (above < reach && temp < maxTemp) {
    temp += randomNormalDistribution(0, 5) * power * gain * Math.pow(1 - above / reach, shape)
  }
  if (temp > maxTemp) return maxTemp
  if (temp < 0) return 0
  return temp
}
