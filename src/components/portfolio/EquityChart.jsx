import { useMemo } from 'react'
import { useNow } from '../../hooks/useNow.js'
import { useAccountStore } from '../../store/accountStore.js'
import { formatCompactCurrency } from '../../utils/format.js'
import LineChart from '../ui/LineChart.jsx'

const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric' })

/** Equity over time from stored snapshots, plus the live value as the last point. */
export default function EquityChart({ netWorth }) {
  const snapshots = useAccountStore((s) => s.portfolio?.snapshots ?? [])
  const now = useNow(30000)
  const data = useMemo(() => {
    const points = snapshots.map((s) => ({ t: s.t, v: s.equity }))
    if (points.length && now > points[points.length - 1].t) points.push({ t: now, v: netWorth })
    return points
  }, [snapshots, netWorth, now])

  return (
    <section className="card p-4" aria-labelledby="equity-heading">
      <h2 id="equity-heading" className="font-semibold">
        Equity over time
      </h2>
      <p className="text-xs text-muted">Snapshots are taken on every trade and every few minutes while prices move.</p>
      <div className="mt-3">
        <LineChart
          data={data}
          height={220}
          label="Account equity over time"
          formatValue={(v) => formatCompactCurrency(v)}
          formatTime={(t) => fmt.format(t)}
        />
      </div>
    </section>
  )
}
