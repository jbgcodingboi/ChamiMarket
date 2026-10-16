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
    // Same reading as the server's quote: a trailing _y is Yes, anything else No.
    .map((part) => ({ id: part.replace(/_[yn]$/, ''), side: /_y$/.test(part) ? 'yes' : 'no' }))
  return legs.length >= 2 && legs.every((l) => l.id) ? legs : null
}

/**
 * Settles a parlay from its legs' outcomes ('yes' | 'no' | 'void' | null for
 * pending, given in the same order as the legs).
 */
export function parlayOutcome(legs, outcomes) {
  // A losing leg decides it whatever else happens, so the result never depends on which leg settled first.
  if (legs.some((l, i) => (outcomes[i] === 'yes' || outcomes[i] === 'no') && outcomes[i] !== l.side)) return 'no'
  if (outcomes.some((o) => o === 'void')) return 'void'
  return outcomes.every((o, i) => o === legs[i].side) ? 'yes' : null
}
