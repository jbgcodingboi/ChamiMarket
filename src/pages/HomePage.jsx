import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import CategoryFilters from '../components/market/CategoryFilters.jsx'
import { CATEGORIES } from '../config.js'
import MarketGrid from '../components/market/MarketGrid.jsx'
import SearchBar from '../components/market/SearchBar.jsx'
import SortSelect from '../components/market/SortSelect.jsx'
import ActivityFeed from '../components/social/ActivityFeed.jsx'
import TradeTicker from '../components/social/TradeTicker.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { SearchIcon } from '../components/ui/Icons.jsx'
import { useDocumentTitle } from '../hooks/useDocumentTitle.js'
import { useMarketStore } from '../store/marketStore.js'
import { useResolutionStore } from '../store/resolutionStore.js'
import { useUiStore } from '../store/uiStore.js'
import { filterMarkets, sortMarkets } from '../utils/filters.js'

export default function HomePage() {
  useDocumentTitle('Markets')
  const status = useMarketStore((s) => s.status)
  const order = useMarketStore((s) => s.order)
  const markets = useMarketStore((s) => s.markets)
  const resolutions = useResolutionStore((s) => s.resolutions)
  const { query, category, sort, setCategory, setSort, setQuery } = useUiStore(
    useShallow((s) => ({
      query: s.query,
      category: s.category,
      sort: s.sort,
      setCategory: s.setCategory,
      setSort: s.setSort,
      setQuery: s.setQuery,
    })),
  )

  const list = useMemo(() => order.map((id) => markets[id]).filter(Boolean), [order, markets])
  const counts = useMemo(() => {
    const matched = filterMarkets(list, { query })
    const counts = { all: matched.length }
    for (const c of CATEGORIES) counts[c.id] = matched.filter((m) => m.category === c.id).length
    return counts
  }, [list, query])
  const visible = useMemo(
    () =>
      sortMarkets(filterMarkets(list, { query, category }), sort, (id) => Boolean(resolutions[id]), {
        sportsFirst: category === 'all' && sort === 'volume',
      }),
    [list, query, category, sort, resolutions],
  )

  const trimmed = query.trim()

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Markets</h1>
            <p className="mt-1 text-sm text-muted">
              Trade Sports and Top Politics outcomes with play money. Prices are probabilities: 62¢ means a 62% chance.
            </p>
          </div>
          <SearchBar className="md:hidden" />
          <div className="lg:hidden">
            <TradeTicker />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="-mx-1 overflow-x-auto px-1">
              <CategoryFilters value={category} onChange={setCategory} counts={counts} />
            </div>
            <SortSelect value={sort} onChange={setSort} />
          </div>
          {trimmed && (
            <p className="text-sm text-muted" aria-live="polite">
              {visible.length} result{visible.length === 1 ? '' : 's'} for “{trimmed}”
            </p>
          )}
          <MarketGrid
            markets={visible}
            loading={status === 'loading'}
            empty={
              <EmptyState
                icon={SearchIcon}
                title="No markets match"
                action={
                  trimmed ? (
                    <button type="button" className="btn btn-ghost" onClick={() => setQuery('')}>
                      Clear search
                    </button>
                  ) : null
                }
              >
                {trimmed
                  ? `Nothing in ${category === 'all' ? 'any category' : CATEGORIES.find((c) => c.id === category).label} matches “${trimmed}”. Try a team, league, race or party.`
                  : category === 'chaminade'
                    ? 'No Chaminade games in the next two weeks have markets yet. They appear here as games are added to the athletics calendar.'
                    : 'There are no open markets in this category right now.'}
              </EmptyState>
            }
          />
        </div>
        <aside className="hidden lg:block" aria-label="Activity">
          <div className="sticky top-24">
            <ActivityFeed />
          </div>
        </aside>
      </div>
    </div>
  )
}
