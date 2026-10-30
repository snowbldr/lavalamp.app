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
// bonus for touching takes over. That only ever warms the bottom row; the heating elements in
// the simulation are what reach up into the pool.
// `floor` is where the floor is under this particle, which with cups in the floor is below the
// bottom edge of the screen; the heater is measured from there. No test that y is above the
// floor: a floor particle is often a hair below it when this runs, nudged by a neighbour's
// relaxation after its own containment, and those are exactly the particles in contact with
// the heater (a guard here cut the lamp's detached rising globs by five sixths).
export function nextTemperature (temp, y, height, maxTemp, particleSize, power = 1, floor = height) {
  if (temp > 0) {
    temp -= randomNormalDistribution(0.25, 2.75, 1.8) * (height / REFERENCE_HEIGHT)
  }
  if (y > floor - height * (1 - HEAT_ZONE) && temp < maxTemp) {
    // Distance to the heater line either way: lava below the line, in a floor bottle, is as far
    // from the heater as lava the same distance above it. With `floor - y` alone every hidden
    // particle clamped to 1 px and got full contact heat all the time, and the reserve glowed
    // (Robert: "the baseline heater is now keeping the bottles quite warm ... then when the
    // heaters fire, it just blasts out aggressively every time instead of like, glooping out").
    const distanceFromHeater = Math.max(1, Math.abs(floor - y))
    const increase = randomNormalDistribution(0, 5) / distanceFromHeater * power
    temp += increase
    if (Math.abs(floor - y) < particleSize) {
      temp += increase * increase
    }
  }
  if (temp > maxTemp) return maxTemp
  if (temp < 0) return 0
  return temp
}
