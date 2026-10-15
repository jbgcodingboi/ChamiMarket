import { useMemo } from 'react'
import { useAccountStore } from '../store/accountStore.js'
import { useMarketStore } from '../store/marketStore.js'
import { getOutcomePrice } from '../store/prices.js'
import { useResolutionStore } from '../store/resolutionStore.js'
import { computeMetrics } from '../utils/portfolio.js'

/** Live portfolio metrics; recomputed when the portfolio or any price changes. */
export function usePortfolioMetrics() {
  const portfolio = useAccountStore((s) => s.portfolio)
  const tick = useMarketStore((s) => s.tick)
  const resolutions = useResolutionStore((s) => s.resolutions)
  return useMemo(
    () => (portfolio ? computeMetrics(portfolio, getOutcomePrice) : null),
    // tick and resolutions are inputs to getOutcomePrice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio, tick, resolutions],
  )
}
