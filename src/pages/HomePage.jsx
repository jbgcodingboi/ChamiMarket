import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import CategoryFilters from '../components/market/CategoryFilters.jsx'
import { CATEGORIES } from '../config.js'
import MarketGrid from '../components/market/MarketGrid.jsx'
import SearchBar from '../components/market/SearchBar.jsx'
import SortSelect from '../components/market/SortSelect.jsx'
import ActivityFeed from '../components/social/ActivityFeed.jsx'
import TradeTicker from '../components/social/TradeTicker.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import Tabs from '../components/ui/Tabs.jsx'
import { ClockIcon, SearchIcon } from '../components/ui/Icons.jsx'
import { DAY_MS } from '../components/market/ClosesIn.jsx'
import { useClock } from '../store/clockStore.js'
import { useDocumentTitle } from '../hooks/useDocumentTitle.js'
import { useMarketStore } from '../store/marketStore.js'
import { useResolutionStore } from '../store/resolutionStore.js'
import { useUiStore } from '../store/uiStore.js'
import { filterMarkets, sortMarkets } from '../utils/filters.js'
import { own } from '../utils/safe.js'
import { ALL_SPORTS, effectiveSport, sportTabs } from '../utils/sports.js'

const isEndingSoon = (m, now) => {
  const left = Date.parse(m.endDate) - now
  return left > 0 && left <= DAY_MS
}

export default function HomePage() {
  useDocumentTitle('Markets')
  const status = useMarketStore((s) => s.status)
  const order = useMarketStore((s) => s.order)
  const markets = useMarketStore((s) => s.markets)
  const resolutions = useResolutionStore((s) => s.resolutions)
  const { query, category, sort, sport, setCategory, setSort, setSport, setQuery, endingSoon, toggleEndingSoon } = useUiStore(
    useShallow((s) => ({
      endingSoon: s.endingSoon,
      toggleEndingSoon: s.toggleEndingSoon,
      query: s.query,
      category: s.category,
      sort: s.sort,
      sport: s.sport,
      setCategory: s.setCategory,
      setSort: s.setSort,
      setSport: s.setSport,
      setQuery: s.setQuery,
    })),
  )

  const now = useClock((s) => s.now)
  const all = useMemo(() => order.map((id) => markets[id]).filter(Boolean), [order, markets])
  const list = useMemo(
    () => (endingSoon ? all.filter((m) => isEndingSoon(m, now)) : all),
    [all, endingSoon, now],
  )
  const matched = useMemo(() => filterMarkets(list, { query }), [list, query])
  const counts = useMemo(() => {
    const counts = { all: matched.length }
    for (const c of CATEGORIES) counts[c.id] = matched.filter((m) => m.category === c.id).length
    return counts
  }, [matched])
  // Sports sub-categories: only those with markets in the current listing are offered,
  // and a selection with none falls back to "All sports".
  const sportOptions = useMemo(() => (category === 'sports' ? sportTabs(matched) : []), [category, matched])
  const activeSport = useMemo(() => effectiveSport(sport, matched), [sport, matched])
  // Forget a sub-category that has dropped out of the listing altogether (e.g. after a refresh).
  useEffect(() => {
    if (sport !== ALL_SPORTS && all.length && effectiveSport(sport, all) === ALL_SPORTS) setSport(ALL_SPORTS)
  }, [sport, all, setSport])
  const visible = useMemo(
    () =>
      sortMarkets(
        filterMarkets(list, { query, category, sport: activeSport }),
        sort,
        (id) => Boolean(own(resolutions, id)),
        { sportsFirst: category === 'all' && sort === 'volume' },
      ),
    [list, query, category, activeSport, sort, resolutions],
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleEndingSoon}
                aria-pressed={endingSoon}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition ${
                  endingSoon ? 'border-warn/60 bg-warn/15 text-warn' : 'border-line text-muted hover:text-fg'
                }`}
              >
                <ClockIcon className="size-4" /> Ending in 24h
              </button>
              <SortSelect value={sort} onChange={setSort} />
            </div>
          </div>
          {sportOptions.length > 1 && (
            <div className="-mx-1 overflow-x-auto px-1">
              <Tabs
                tabs={sportOptions}
                value={activeSport}
                onChange={setSport}
                label="Sport or league"
                size="sm"
                className="md:flex-wrap"
              />
            </div>
          )}
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
                  : endingSoon
                    ? 'Nothing here closes in the next 24 hours. Turn off "Ending in 24h" to see everything.'
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
