import { div, label } from 'https://cdn.jsdelivr.net/npm/@srfnstack/fntags@0.3.8/src/fnelements.min.mjs'

export const randomBetween = (min, max) => Math.trunc(Math.random() * ( max - min ) + min)

export function randomNormalDistribution (min, max, skew = 1) {
  let u = 0, v = 0
  while (u === 0) {
    u = Math.random()
  } //Converting [0,1) to (0,1)
  while (v === 0) {
    v = Math.random()
  }
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)

  num = num / 10.0 + 0.5 // Translate to 0 -> 1
  if (num > 1 || num < 0) num = randomNormalDistribution(min, max, skew) // resample between 0 and 1 if out of range
  num = Math.pow(num, skew) // Skew
  num *= max - min // Stretch to fill range
  num += min // offset to min
  return Math.trunc(num)
}

export function hexToRgb (hex) {
  const bigint = parseInt(hex.slice(1), 16)
  return {
    r: ( bigint >> 16 ) & 255,
    g: ( bigint >> 8 ) & 255,
    b: bigint & 255
  }
}

export function rgbToHex (color) {
  return `#${( 1 << 24 | color.r << 16 | color.g << 8 | color.b ).toString(16).slice(1)}`
}

export const formInput = (inputLabel, theInput, setDefault) => {
  theInput.style.cursor = 'pointer'
  return div(
    {
      style: {
        display: 'flex',
        'flex-direction': 'row',
        'width': '100%',
        margin: '10px',
        'justify-content': 'space-between'
      }
    },
    label({ for: theInput.getAttribute('id') }, inputLabel),
    div(
      {
        style: {
          display: 'flex',
          'flex-direction': 'row'
        }
      },
      theInput,
      setDefault ? setDefault : ''
    )
  )
}

export function notify (...message) {
  let notification = div(
    {
      style: {
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        width: '25vw',
        'min-width': '250px',
        background: 'rgb(220,220,220,.6)',
        'text-align': 'center',
        'line-height': '100px',
        'font-size': '25px',
        'z-index': 100,
        'border-radius': '8px'
      }
    },
    ...message
  )
  document.body.append(notification)
  let notifyTime = 2000
  notification.animate(
    [
      { opacity: 1 },
      { opacity: 0 }
    ],
    notifyTime
  )
  notification.style.opacity = 0
  setTimeout(() => notification.remove(), notifyTime)
}

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

// borrowed from https://gist.github.com/peeke/e65e8c162a22b21ac9ac9de07a4afeac
export class SpatialHashMap {
  constructor (width, height) {
    this.width = width
    this.height = height
    this.grid = new Array(width * height).fill(null).map(() => [])
  }

  clear () {
    this.grid.forEach(cell => {
      cell.splice(0)
    })
  }

  add (x, y, data) {
    x = clamp(Math.round(x), 0, this.width - 1)
    y = clamp(Math.round(y), 0, this.height - 1)

    const index = x + y * this.width
    let cell = this.grid[index]
    cell.push(data)
  }

  query (x, y, radius) {
    if (radius) {
      return this.queryWithRadius(x, y, radius)
    }

    x = clamp(Math.round(x), 0, this.width - 1)
    y = clamp(Math.round(y), 0, this.height - 1)

    const index = x + y * this.width
    return this.grid[index]
  }

  queryWithRadius (x, y, radius) {
    const left = Math.max(Math.round(x - radius), 0)
    const right = Math.min(Math.round(x + radius), this.width - 1)
    const bottom = Math.max(Math.round(y - radius), 0)
    const top = Math.min(Math.round(y + radius), this.height - 1)

    const result = []

    for (let i = left; i <= right; i++) {
      for (let j = bottom; j <= top; j++) {
        const query = this.query(i, j)
        for (let k = 0; k < query.length; k++) {
          result.push(query[k])
        }
      }
    }

    return result
  }
}