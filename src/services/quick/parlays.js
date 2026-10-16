/**
 * Parlays are no longer offered. These helpers stay so positions opened
 * earlier can still be priced and settled from their legs: ids list the legs
 * ("q-parlay-<marketId>_y~<marketId>_n"), a losing leg settles a parlay No
 * right away, all winning legs settle it Yes, and a voided leg voids it.
 */

export const parlayId = (legs) => `q-parlay-${legs.map((l) => `${l.id}_${l.side === 'yes' ? 'y' : 'n'}`).join('~')}`

export function parseParlayId(id) {
  if (typeof id !== 'string' || !id.startsWith('q-parlay-')) return null
  const legs = id
    .slice('q-parlay-'.length)
    .split('~')
    .map((part) => {
      const i = part.lastIndexOf('_')
      return { id: part.slice(0, i), side: part.slice(i + 1) === 'y' ? 'yes' : 'no' }
    })
  return legs.length >= 2 && legs.every((l) => l.id) ? legs : null
}

/**
 * Settles a parlay from its legs' outcomes ('yes' | 'no' | 'void' | null for
 * pending, given in the same order as the legs).
 */
export function parlayOutcome(legs, outcomes) {
  if (outcomes.some((o) => o === 'void')) return 'void'
  if (legs.some((l, i) => outcomes[i] && outcomes[i] !== l.side)) return 'no'
  return outcomes.every((o, i) => o === legs[i].side) ? 'yes' : null
}
