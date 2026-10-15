import { useEffect, useMemo, useState } from 'react'
import { useNow } from '../../hooks/useNow.js'
import { CHART_RANGES, fetchPriceHistory } from '../../services/clob.js'
import { syntheticHistory } from '../../services/synthetic.js'
import { formatPercent, formatProbability } from '../../utils/format.js'
import LineChart from '../ui/LineChart.jsx'
import { Skeleton } from '../ui/Skeleton.jsx'
import Tabs from '../ui/Tabs.jsx'

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

/**
 * Probability chart for the selected outcome. Uses CLOB price history when
 * the market has token ids and the API answers, otherwise a deterministic
 * synthetic series that always ends at the current price.
 */
export default function PriceChart({ market, side }) {
  const [rangeId, setRangeId] = useState('1W')
  const range = CHART_RANGES.find((r) => r.id === rangeId)
  const tokenId = market.tokenIds?.[0] ?? null
  const requestKey = tokenId ? `${tokenId}:${rangeId}` : null
  const [result, setResult] = useState({ key: null, points: null })

  useEffect(() => {
    if (!requestKey) return undefined
    let cancelled = false
    fetchPriceHistory(tokenId, range)
      .then((points) => !cancelled && setResult({ key: requestKey, points }))
      .catch(() => !cancelled && setResult({ key: requestKey, points: null }))
    return () => {
      cancelled = true
    }
  }, [requestKey, tokenId, range])

  const loading = requestKey !== null && result.key !== requestKey
  const livePoints = result.key === requestKey ? result.points : null
  const synthetic = !livePoints
  const sidePrice = side === 'yes' ? market.yesPrice : market.noPrice
  const now = useNow(30000)

  const data = useMemo(() => {
    const yesSeries = livePoints ?? syntheticHistory(market.id, market.yesPrice, range, now)
    const series = yesSeries.map((pt) => ({ t: pt.t, v: side === 'yes' ? pt.p : 1 - pt.p }))
    if (series.length && now - series[series.length - 1].t > 1000) series.push({ t: now, v: sidePrice })
    else if (series.length) series[series.length - 1] = { t: series[series.length - 1].t, v: sidePrice }
    return series
  }, [livePoints, market.id, market.yesPrice, range, side, sidePrice, now])

  const change = data.length > 1 ? (data[data.length - 1].v - data[0].v) * 100 : 0

  return (
    <section className="card p-4" aria-labelledby="chart-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="chart-heading" className="text-sm text-muted">
            {market.labels[side]} probability
          </h2>
          <p className="mt-0.5 flex items-baseline gap-2">
            <span className={`text-3xl font-bold tabular ${side === 'yes' ? 'text-yes' : 'text-no'}`}>
              {formatProbability(sidePrice)}
            </span>
            <span className="text-sm text-muted">chance</span>
            <span className={`text-sm font-medium tabular ${change >= 0 ? 'text-yes' : 'text-no'}`}>
              {change >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(change), { decimals: 1 })} pts
            </span>
          </p>
        </div>
        <Tabs tabs={CHART_RANGES} value={rangeId} onChange={setRangeId} label="Chart time range" size="sm" />
      </div>
      <div className="mt-4">
        {loading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : (
          <LineChart
            data={data}
            label={`${market.labels[side]} probability over ${range.label}`}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            formatTime={(t) => (rangeId === '1D' ? timeFmt.format(t) : dayFmt.format(t))}
          />
        )}
      </div>
      {synthetic && !loading && (
        <p className="mt-2 text-xs text-subtle">
          Simulated history for illustration. It is generated from the current price.
        </p>
      )}
    </section>
  )
}
