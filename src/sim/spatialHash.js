const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

// Uniform grid over a width x height region, in pixels. Each cell holds particle indices.
// Started life as https://gist.github.com/peeke/e65e8c162a22b21ac9ac9de07a4afeac and was changed so
// that callers only ever speak pixels: the cell size lives here and nowhere else.
export class SpatialHash {
  constructor (width, height, cellSize) {
    this.resize(width, height, cellSize)
  }

  resize (width, height, cellSize = this.cellSize) {
    this.cellSize = cellSize
    this.cols = Math.max(1, Math.ceil(width / cellSize))
    this.rows = Math.max(1, Math.ceil(height / cellSize))
    this.cells = Array.from({ length: this.cols * this.rows }, () => [])
  }

  clear () {
    for (const cell of this.cells) cell.length = 0
  }

  add (x, y, index) {
    this.cells[this.cellX(x) + this.cellY(y) * this.cols].push(index)
  }

  // Every index stored in a cell that overlaps the square of half-width `radius` around (x, y).
  // A superset of the true neighbours; callers filter by real distance.
  query (x, y, radius) {
    const left = this.cellX(x - radius)
    const right = this.cellX(x + radius)
    const top = this.cellY(y - radius)
    const bottom = this.cellY(y + radius)
    const result = []
    for (let i = left; i <= right; i++) {
      for (let j = top; j <= bottom; j++) {
        const cell = this.cells[i + j * this.cols]
        for (let k = 0; k < cell.length; k++) result.push(cell[k])
      }
    }
    return result
  }

  cellX (x) {
    return clamp(Math.floor(x / this.cellSize), 0, this.cols - 1)
  }

  cellY (y) {
    return clamp(Math.floor(y / this.cellSize), 0, this.rows - 1)
  }
}
