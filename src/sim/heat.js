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
// `power` scales the heater at the floor, 0 to 1 normally, up to 3 under a heat spot; on load it
// is a front spreading from the centre of the floor. Heating is contact heating: a 1/distance
// term that cooling swamps everywhere except within a few pixels of the floor, where the squared
// bonus for touching takes over. That only ever warms the bottom row; the heating rods in the
// simulation are what reach up into the pool.
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
