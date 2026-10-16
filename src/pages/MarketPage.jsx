import { useCallback } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import MarketDetail from '../components/market/MarketDetail.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { SearchIcon } from '../components/ui/Icons.jsx'
import { PageSkeleton } from '../components/ui/Skeleton.jsx'
import { useDocumentTitle } from '../hooks/useDocumentTitle.js'
import { useMarket, useMarketStore } from '../store/marketStore.js'

export default function MarketPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const side = params.get('side') === 'no' ? 'no' : 'yes'
  const market = useMarket(id)
  const status = useMarketStore((s) => s.status)
  useDocumentTitle(market?.title ?? 'Market')

  const setSide = useCallback(
    (next) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          p.set('side', next)
          return p
        },
        { replace: true },
      ),
    [setParams],
  )

  if (!market) {
    if (status === 'loading') return <PageSkeleton />
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          icon={SearchIcon}
          title="Market not found"
          action={
            <Link to="/" className="btn btn-primary">
              Browse markets
            </Link>
          }
        >
          This market isn't in the current listings. It may have closed or dropped out of the
          live feed.
        </EmptyState>
      </div>
    )
  }

  return <MarketDetail market={market} side={side} onSideChange={setSide} />
}
