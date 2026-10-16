/**
 * Mines: a 5x5 grid hiding 1 to 24 mines. Each gem revealed raises the
 * multiplier to 0.99 / P(all picks so far were safe), floored to 2 decimals,
 * computed with exact integers so the browser and the server always agree.
 */
export const TILES = 25
export const MIN_MINES = 1
export const MAX_MINES = 24

/** Mine positions (0 to 24) from 24 provably fair floats: a Fisher-Yates draw of the tiles, first `mines` taken. */
export function placeMines(floats, mines) {
  const tiles = Array.from({ length: TILES }, (_, i) => i)
  const order = []
  for (let i = 0; i < TILES - 1; i++) order.push(tiles.splice(Math.floor(floats[i] * (TILES - i)), 1)[0])
  order.push(tiles[0])
  return order.slice(0, mines).sort((a, b) => a - b)
}

/** Multiplier after `gems` safe picks with `mines` mines on the board. */
export function multiplier(mines, gems) {
  if (gems <= 0) return 1
  let num = 99n
  let den = 100n
  for (let i = 0; i < gems; i++) {
    num *= BigInt(TILES - i)
    den *= BigInt(TILES - mines - i)
  }
  return Number((num * 100n) / den) / 100
}

export const maxGems = (mines) => TILES - mines

/** Chance the next pick is safe, given picks so far. */
export const nextSafeChance = (mines, gems) => (TILES - mines - gems) / (TILES - gems)
