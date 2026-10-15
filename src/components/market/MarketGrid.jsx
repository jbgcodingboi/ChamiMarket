import { memo } from 'react'
import { MarketCardSkeleton } from '../ui/Skeleton.jsx'
import MarketCard from './MarketCard.jsx'

function MarketGrid({ markets, loading, empty }) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading markets">
        {Array.from({ length: 9 }, (_, i) => (
          <MarketCardSkeleton key={i} />
        ))}
      </div>
    )
  }
  if (!markets.length) return empty
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {markets.map((m) => (
        <MarketCard key={m.id} market={m} />
      ))}
    </div>
  )
}

export default memo(MarketGrid)
