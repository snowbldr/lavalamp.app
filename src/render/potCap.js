// The temperature a particle is drawn at. Lava below the floor's line, in a pot, is never on
// screen but its glow reaches over the line, so it is drawn no hotter than the neutral
// temperature (a closed pot's superheated lava showed as a white streak along the bottom), unless
// there is lava on screen just above it: then it is drawn at that lava's temperature, hotter or
// colder. A closed pot holds its lava in a row under the line, and at the neutral cap that row
// showed as a row of dots along the top of a heating pot, red under white-hot lava as much as red
// under cold purple (Robert: "There's a bubbling defect on the top of the pots still... now it only
// happens as it's heating"; "I still see the line on the bottom"). The lava above is read in BIN
// px columns, BAND particle sizes deep; a column with none on screen keeps the neutral cap.
const BIN = 8
const BAND = 3
let sums = new Float32Array(0)
let counts = new Uint16Array(0)

// A closed pot packs its lava in a row just under the line, and that row holds the tank's lava off
// by about 6 px (seed 760803244, a pot charged 4 s, over its cup: 182 particles 0 to 2 px under
// the line, none from 0 to 6 px above it, the tank's lava above at twice neutral). Lava drawn in
// the pot's top LIFT_BAND particle sizes is drawn LIFT particle sizes higher, closing the gap.
const LIFT_BAND = 2
const LIFT = 1.5

export function drawnY (state, floorY, size) {
  if (!(floorY < Infinity)) return i => state.y[i]
  const bottom = floorY + LIFT_BAND * size
  const lift = LIFT * size
  return i => { const y = state.y[i]; return y > floorY && y < bottom ? y - lift : y }
}

export function drawnTemps (state, count, floorY, neutral, size) {
  if (!(floorY < Infinity)) return i => state.temp[i]
  let maxX = 0
  for (let i = 0; i < count; i++) if (state.x[i] > maxX) maxX = state.x[i]
  const bins = Math.ceil(maxX / BIN) + 1
  if (sums.length < bins) { sums = new Float32Array(bins); counts = new Uint16Array(bins) } else { sums.fill(0, 0, bins); counts.fill(0, 0, bins) }
  const top = floorY - BAND * size
  for (let i = 0; i < count; i++) {
    const y = state.y[i]
    if (y > floorY || y < top) continue
    const b = Math.max(0, Math.floor(state.x[i] / BIN))
    sums[b] += state.temp[i]
    if (counts[b] < 65535) counts[b]++
  }
  return i => {
    const t = state.temp[i]
    if (state.y[i] <= floorY) return t
    const b = Math.max(0, Math.min(bins - 1, Math.floor(state.x[i] / BIN)))
    return counts[b] ? sums[b] / counts[b] : Math.min(t, neutral)
  }
}
