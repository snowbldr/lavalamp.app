// The lamp's frame inside the page. The simulation always has its floor at the bottom, so when
// gravity points at another edge of the screen the whole lamp is turned in quarter turns to put
// its floor on that edge. Page coordinates are x right, y down; a positive turn is clockwise.

export const TURNS = { bottom: 0, left: 1, top: 2, right: 3 }

// Lamp width and height for a page of the given size, turned `turns` quarter turns.
export const lampSizeFor = (turns, pageWidth, pageHeight) =>
  turns % 2 === 0 ? [pageWidth, pageHeight] : [pageHeight, pageWidth]

// A vector in page coordinates expressed in the lamp's frame.
export const pageVectorToLamp = (turns, x, y) => {
  switch (turns & 3) {
    case 0: return [x, y]
    case 1: return [y, -x]
    case 2: return [-x, -y]
    default: return [-y, x]
  }
}

// A vector in the lamp's frame expressed in page coordinates.
export const lampVectorToPage = (turns, x, y) => pageVectorToLamp((4 - turns) & 3, x, y)

// A page point in lamp coordinates, for a page and lamp of the given sizes.
export const pageToLamp = (turns, pageWidth, pageHeight, lampWidth, lampHeight, px, py) => {
  const [x, y] = pageVectorToLamp(turns, px - pageWidth / 2, py - pageHeight / 2)
  return [x + lampWidth / 2, y + lampHeight / 2]
}

// A lamp point in page coordinates.
export const lampToPage = (turns, pageWidth, pageHeight, lampWidth, lampHeight, lx, ly) => {
  const [x, y] = lampVectorToPage(turns, lx - lampWidth / 2, ly - lampHeight / 2)
  return [x + pageWidth / 2, y + pageHeight / 2]
}
