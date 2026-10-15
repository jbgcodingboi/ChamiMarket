import { getMarket } from './marketStore.js'
import { useResolutionStore } from './resolutionStore.js'

/**
 * Current price of an outcome, in dollars per share. Resolved markets value
 * winning shares at $1.00 and losing shares at $0.00.
 */
export function getOutcomePrice(marketId, side) {
  const res = useResolutionStore.getState().resolutions[marketId]
  if (res) return res.outcome === side ? 1 : 0
  const market = getMarket(marketId)
  if (!market) return null
  return side === 'yes' ? market.yesPrice : market.noPrice
}

export const marketPrice = (market, side) => (side === 'yes' ? market.yesPrice : market.noPrice)
