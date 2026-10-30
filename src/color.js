export function hexToRgb (hex) {
  const bigint = parseInt(hex.slice(1), 16)
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  }
}

export function rgbToHex (color) {
  return `#${(1 << 24 | color.r << 16 | color.g << 8 | color.b).toString(16).slice(1)}`
}
