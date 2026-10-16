import { getMarket } from './marketStore.js'
import { own } from '../utils/safe.js'
import { useResolutionStore } from './resolutionStore.js'

/**
 * Current price of an outcome, in dollars per share. Resolved markets value
 * winning shares at $1.00 and losing shares at $0.00; voided markets return
 * null so positions are valued at cost.
 */
export function getOutcomePrice(marketId, side) {
  const res = own(useResolutionStore.getState().resolutions, marketId)
  if (res?.outcome === 'void') return null
  if (res) return res.outcome === side ? 1 : 0
  const market = getMarket(marketId)
  if (!market) return null
  return side === 'yes' ? market.yesPrice : market.noPrice
}

export const marketPrice = (market, side) => (side === 'yes' ? market.yesPrice : market.noPrice)
