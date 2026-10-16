import { memo, useState } from 'react'
import { MarketCardSkeleton } from '../ui/Skeleton.jsx'
import MarketCard from './MarketCard.jsx'

const PAGE = 48

function MarketGrid({ markets, loading, empty }) {
  const [limit, setLimit] = useState(PAGE)
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
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {markets.slice(0, limit).map((m) => (
          <MarketCard key={m.id} market={m} />
        ))}
      </div>
      {markets.length > limit && (
        <div className="text-center">
          <button type="button" className="btn btn-ghost" onClick={() => setLimit((l) => l + PAGE)}>
            Show more markets ({markets.length - limit} more)
          </button>
        </div>
      )}
    </div>
  )
}

export default memo(MarketGrid)
