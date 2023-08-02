import { canvas } from 'https://cdn.jsdelivr.net/npm/@srfnstack/fntags@0.3.8/src/fnelements.min.mjs'
import {
  defaultGravityStrength,
  defaultParticleCount,
  gravityStrength,
  highlightColor,
  interactionRadius,
  interactionRadiusSq,
  lavaColor,
  maxTemp,
  particleCount,
  particleSize,
  restDensity,
  settings,
  stiffness,
  stiffnessNear
} from './settings.mjs'
import { randomBetween, randomNormalDistribution, SpatialHashMap } from './base.mjs'

const GRID_CELLS = 54
const gravity = [0, gravityStrength()]
const DEVICE_FORCE = [0, 0]
const deviceAcceleration = [0, 0]

export const animateLava = (lamp) => {
  lamp.addEventListener('click', () => {
    if (settings.parentNode) {
      settings.remove()
    }
  })
  const context = lamp.getContext('2d')
  const tmpCanvas = canvas()
  let height = lamp.height = tmpCanvas.height = Math.min(window.innerHeight, 1000)
  let width = lamp.width = tmpCanvas.width = Math.min(window.innerWidth, 1000)
  const calcSlope = (x1, y1, x2, y2) => ( y2 - y1 ) / ( x2 - x1 )
  const lineEq = (slope, x1, y1) => {
    const b = y1 - slope * x1
    return (x) => slope * x + b
  }
  let leftBottomEnd = width * .45
  let rightBottomStart = width * .55
  let bottomStart = height * .8
  let leftBottomSlope = calcSlope(0, bottomStart, leftBottomEnd, height)
  let leftBottomLine = lineEq(leftBottomSlope, 0, bottomStart)
  let rightBottomSlope = calcSlope(rightBottomStart, height, width, bottomStart)
  let rightBottomLine = lineEq(rightBottomSlope, rightBottomStart, height)

  window.addEventListener('resize', () => {
    height = lamp.height = tmpCanvas.height = Math.min(window.innerHeight, 1000)
    width = lamp.width = tmpCanvas.width = Math.min(window.innerWidth, 1000)
    leftBottomEnd = width * .45
    rightBottomStart = width * .55
    bottomStart = height * .7
    leftBottomSlope = calcSlope(0, bottomStart, leftBottomEnd, height)
    leftBottomLine = lineEq(leftBottomSlope, 0, bottomStart)
    rightBottomSlope = calcSlope(rightBottomStart, height, width, bottomStart)
    rightBottomLine = lineEq(rightBottomSlope, rightBottomStart, height)
    const currentDefaultParticleCount = defaultParticleCount()
    defaultParticleCount(Math.min(Math.trunc(width * height / 1000), 1000))
    if (particleCount() === currentDefaultParticleCount) {
      particleCount(defaultParticleCount())
    }
    const currentDefaultGravityStrength = defaultGravityStrength()
    defaultGravityStrength(Math.min(window.innerHeight/ 2, 500))
    if(gravityStrength() === currentDefaultGravityStrength){
      gravityStrength(defaultGravityStrength())
    }

  })
  const tmpContext = tmpCanvas.getContext('2d', { willReadFrequently: true })

  const highlightHeight = 15
  const initLava = (i) => {
    //set initial positions for each particle
    state.x[i] = randomBetween(0, width)
    state.y[i] = randomBetween(0, height)
    state.vx[i] = 0
    state.vy[i] = 0
    state.temp[i] =  0
  }
  const particleMap = new SpatialHashMap(GRID_CELLS, GRID_CELLS)
  const newState = () => ( {
    x: new Float32Array(particleCount()), // x location
    y: new Float32Array(particleCount()), // y location
    vx: new Float32Array(particleCount()), // horizontal velocity
    temp: new Float32Array(particleCount()),
    vy: new Float32Array(particleCount()), // vertical velocity
    p: new Float32Array(particleCount()), // pressure
    pNear: new Float32Array(particleCount()), // pressure near
    g: new Float32Array(particleCount()), // 'nearness' to neighbour
  } )
  const state = newState()
  const applyGlobalForces = (i) => {
    const force = [gravity[0] + DEVICE_FORCE[0], gravity[1] + DEVICE_FORCE[1]]
    // const force = DEVICE_FORCE
    state.vx[i] += force[0]
    state.vy[i] += force[1]
    let distanceFromHeatSource = height - state.y[i]
    if (distanceFromHeatSource < 1) {
      distanceFromHeatSource = 1
    }
    if (state.temp[i] > 0) {
      const tempDecrease = randomNormalDistribution(0.25, 2.75, 1.8) * (1000 / Math.min(window.innerHeight, 1000))
      state.temp[i] -= tempDecrease
    }
    //hard cut off is faster than applying a gradient
    if (state.y[i] > bottomStart && state.temp[i] < maxTemp()) {
      const tempIncrease = randomNormalDistribution(0.00000001, 5) / distanceFromHeatSource
      state.temp[i] += tempIncrease
      if(state.y[i] > height - particleSize()){
        state.temp[i] += tempIncrease * tempIncrease
      }
    }
    // share heat with neighbors to increase blob size
    const radius = ( interactionRadius() / width ) * GRID_CELLS
    let neighbors = particleMap.query(state.x[i], state.y[i], radius)
    //faster than calculating distance and applying a gradient
    const neighborTempIncrease = state.temp[i] / neighbors.length
    for (const k of neighbors) {
      if (state.temp[k] < maxTemp()) {
        state.temp[k] += neighborTempIncrease
        state.vy[k] -= state.temp[k]
      }
    }
    if (state.temp[i] > maxTemp()) {
      state.temp[i] = maxTemp()
    }
    if (state.temp[i] < 0) {
      state.temp[i] = 0
    }
    state.vy[i] -= state.temp[i]
  }
  const gradient = (i, n) => {
    const particle = [state.x[i], state.y[i]] // position of i
    const neighbour = [state.x[n], state.y[n]] // position of n

    const lsq = lengthSq(subtract(particle, neighbour))
    if (lsq > interactionRadiusSq) return 0

    const distance = Math.sqrt(lsq)
    return 1 - distance / interactionRadius()
  }

  const subtract = ([x1, y1], [x2, y2]) => [x1 - x2, y1 - y2]
  const lengthSq = ([x, y]) => x * x + y * y
  const multiplyScalar = ([x, y], r) => [x * r, y * r]

  //approximate unit vector
  //https://www.h3xed.com/programming/fast-unit-vector-calculation-for-2d-games
  const unitApprox = (t) => {
    if (0 === t[0] && 0 === t[1]) return [0, 0]
    const ax = Math.abs(t[0]), ay = Math.abs(t[1])
    let ratio = 1 / Math.max(ax, ay)
    ratio *= 1.29289 - ( ax + ay ) * ratio * 0.29289
    return multiplyScalar(t, ratio)
  }

  const getNeighboursWithGradients = i => {
    const gridX = Math.floor(state.x[i] / GRID_CELLS),
      gridY = Math.floor(state.y[i] / GRID_CELLS)
    const radius = ( interactionRadius() / width ) * GRID_CELLS

    const results = particleMap.query(gridX, gridY, radius)
    const neighbours = []

    for (let k = 0; k < results.length; k++) {

      const n = results[k]
      if (i === n) continue // Skip itself

      const g = gradient(i, n)
      if (g === 0) continue

      state.g[n] = g // Store the gradient
      neighbours.push(n) // Push the neighbour to neighbours

    }

    return neighbours
  }

  const updatePressure = (i, neighbours) => {
    let density = 0
    let nearDensity = 0

    for (let k = 0; k < neighbours.length; k++) {
      const g = state.g[neighbours[k]] // Get g for this neighbour
      density += g * g
      nearDensity += g * g * g
    }
    state.p[i] = stiffness() * ( density - restDensity() )
    state.pNear[i] = stiffnessNear() * nearDensity
  }

  const relax = (i, neighbours, dt) => {
    const pos = [state.x[i], state.y[i]]

    for (let k = 0; k < neighbours.length; k++) {
      const n = neighbours[k]
      const g = state.g[n]

      const nPos = [state.x[n], state.y[n]]
      const magnitude = state.p[i] * g + state.pNear[i] * g * g

      const direction = unitApprox(subtract(nPos, pos))
      const force = multiplyScalar(direction, magnitude)

      const d = multiplyScalar(force, dt * dt)
      state.x[i] += d[0] * -1
      state.y[i] += d[1] * -1

      state.x[n] += d[0] * .1
      state.y[n] += d[1] * .1
    }
  }

  const contain = (i) => {
    if (state.x[i] > width) {
      state.x[i] = width
    }
    if (state.x[i] < 0) {
      state.x[i] = 0
    }

    if (state.x[i] < 0) {
      state.x[i] = 0
    } else if (state.x[i] > width) {
      state.x[i] = width
    } else if (state.y[i] > height) {
      state.y[i] = height
    }
    if (state.y[i] < 0) {
      state.y[i] = 0
    }
  }

  function drawLava (i) {
    const gradient = tmpContext.createRadialGradient(state.x[i], state.y[i], 0, state.x[i], state.y[i], particleSize())
    gradient.addColorStop(0, `rgba(${lavaColor().r},${lavaColor().g},${lavaColor().b},1)`)
    gradient.addColorStop(1, `rgba(${lavaColor().r},${lavaColor().g},${lavaColor().b},0)`)
    tmpContext.beginPath()
    tmpContext.fillStyle = gradient
    tmpContext.arc(state.x[i], state.y[i], particleSize(), 0, Math.PI * 2)
    tmpContext.fill()
  }

  function isBottom (pix, row, col) {
    return ( row + 1 < height && pix[pixIndex(row + 1, col) + 3] === 0 ) || row === height - 2
  }

  const pixIndex = (row, col) => row * width * 4 + col * 4

  const addGradient = (pix, i, percent, r = 0, g = 0, b = 0) => {
    const x = 1 - percent
    pix[i] = percent * pix[i] + x * r
    pix[i + 1] = percent * pix[i + 1] + x * g
    pix[i + 2] = percent * pix[i + 2] + x * b
  }

  function drawHighlights (pix) {
    const color = highlightColor()
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const i = pixIndex(row, col)
        if (pix[i + 3] === 255 && isBottom(pix, row, col, i)) {
          for (let j = 0; j < highlightHeight; j++) {
            let up = pixIndex(row - j, col)
            if (row + j < height && pix[up + 3] === 255) {
              addGradient(pix, up, j / highlightHeight, color.r, color.g, color.b)
            }
            //TODO figure out how to draw gradient border around entire blob
          }
        }
      }
    }
  }

  function updateCanvas () {
    let imageData = tmpContext.getImageData(0, 0, width, height),
      pix = imageData.data
    //set transparency based on cutoff to make metaball effect
    //close enough balls will increase the transparency over the threshold to create the blobbing effect
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const i = row * width * 4 + col * 4
        if (pix[i + 3] > 70) {
          pix[i + 3] = 255
        } else {
          pix[i + 3] = 0
        }
      }
    }
    drawHighlights(pix)
    context.putImageData(imageData, 0, 0)
    tmpContext.clearRect(0, 0, width, height)
  }

  function run (dt) {
    particleMap.clear()
    DEVICE_FORCE[0] = ( deviceAcceleration[0] / dt ) * 2
    DEVICE_FORCE[1] = ( deviceAcceleration[1] / dt ) * 2
    deviceAcceleration[0] = 0
    deviceAcceleration[1] = 0
    for (let i = 0; i < particleCount(); i++) {
      applyGlobalForces(i)
      state.x[i] += state.vx[i] * dt
      state.y[i] += state.vy[i] * dt
      const gridX = Math.floor(state.x[i] / GRID_CELLS),
        gridY = Math.floor(state.y[i] / GRID_CELLS)
      particleMap.add(gridX, gridY, i)
    }
    for (let i = 0; i < particleCount(); i++) {
      let neighbours = getNeighboursWithGradients(i)
      updatePressure(i, neighbours)
      relax(i, neighbours, dt)
      contain(i)
      drawLava(i)
      state.vx[i] = 0
      state.vy[i] = 0
    }
    updateCanvas()
  }

  function render () {
    run(1 / 60)
    requestAnimationFrame(render)
  }

  window.addEventListener('deviceorientation', function (n) {
    // GRAVITY[0] = ( n.gamma / 90 ) * gravityStrength * 1.33
    // GRAVITY[1] = ( -n.beta / 90 ) * gravityStrength * 1.33
  })
  window.addEventListener('devicemotion', function (n) {
    deviceAcceleration[0] += n.acceleration.x
    deviceAcceleration[1] += n.acceleration.y
  })
  gravityStrength.subscribe((newStrength, old) => {
    gravity[1] = newStrength
    const diff = newStrength - old
    for (let i = 0; i < state.vy.length; i++) {
      state.vy[i] += diff
    }
  })
  particleCount.subscribe(() => {
    if (state.x.length < particleCount()) {
      const updatedState = newState()
      const originalLength = state.x.length
      for (const f of Object.keys(state)) {
        for (let i = 0; i < state[f].length; i++) {
          updatedState[f][i] = state[f][i]
        }
        state[f] = updatedState[f]
      }
      for (let i = originalLength; i < particleCount(); i++) {
        initLava(i)
      }
    }
    particleMap.clear()
    for (let i = 0; i < particleCount(); i++) {
      const gridX = Math.floor(state.x[i] / GRID_CELLS),
        gridY = Math.floor(state.y[i] / GRID_CELLS)
      particleMap.add(gridX, gridY, i)
    }
  })

  for (let i = 0; i < particleCount(); i++) {
    initLava(i)
    const gridX = Math.floor(state.x[i] / GRID_CELLS),
      gridY = Math.floor(state.y[i] / GRID_CELLS)
    particleMap.add(gridX, gridY, i)
  }

  render(1)
}

export function lavalamp(){
  return canvas(
    {
      id: 'lavalamp',
      width: 500,
      height: 500,
    })
}