const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

// Uniform grid over a width x height region, in pixels. Started life as
// https://gist.github.com/peeke/e65e8c162a22b21ac9ac9de07a4afeac and was changed so that callers
// only ever speak pixels: the cell size lives here and nowhere else. The cells are a counting sort
// into typed arrays rather than an array of arrays: `build` counts the particles per cell, turns
// the counts into start offsets, and places every index, so cell c's particles are
// indices[start[c]] up to indices[start[c + 1]], in index order (stable, so results are bit for bit
// what the array of arrays gave). Callers walk the cells themselves (findNeighbours), which spares
// the candidate list the old query built, and nothing is allocated per step.
export class SpatialHash {
  constructor (width, height, cellSize) {
    this.indices = new Int32Array(0)
    this.resize(width, height, cellSize)
  }

  resize (width, height, cellSize = this.cellSize) {
    this.cellSize = cellSize
    this.cols = Math.max(1, Math.ceil(width / cellSize))
    this.rows = Math.max(1, Math.ceil(height / cellSize))
    this.start = new Int32Array(this.cols * this.rows + 1)
    this.cell = new Int32Array(0) // each particle's cell, scratch for build
  }

  // Sort the first `count` particles of x, y into the cells.
  build (x, y, count) {
    if (this.indices.length < count) {
      this.indices = new Int32Array(count)
      this.cell = new Int32Array(count)
    } else if (this.cell.length < count) {
      this.cell = new Int32Array(count)
    }
    const { start, cell, indices, cols } = this
    start.fill(0)
    for (let i = 0; i < count; i++) {
      const c = this.cellX(x[i]) + this.cellY(y[i]) * cols
      cell[i] = c
      start[c + 1]++
    }
    for (let c = 1; c < start.length; c++) start[c] += start[c - 1]
    // Place each index at its cell's next free slot; start[c] is advanced as the slot fills, so
    // afterwards start[c] is where cell c + 1 begins. Shift back by one cell at the end.
    for (let i = 0; i < count; i++) indices[start[cell[i]]++] = i
    for (let c = start.length - 1; c > 0; c--) start[c] = start[c - 1]
    start[0] = 0
  }

  cellX (x) {
    return clamp(Math.floor(x / this.cellSize), 0, this.cols - 1)
  }

  cellY (y) {
    return clamp(Math.floor(y / this.cellSize), 0, this.rows - 1)
  }
}
