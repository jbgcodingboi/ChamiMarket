import { useEffect } from 'react'
import { POLL_INTERVAL_MS } from './config.js'
import { usePolling } from './hooks/usePolling.js'
import { generateSimTrade } from './services/mockTraders.js'
import { portfolioKey, useAccountStore } from './store/accountStore.js'
import { useFeedStore } from './store/feedStore.js'
import { getMarket, useMarketStore } from './store/marketStore.js'
import { useMockTraderStore } from './store/mockTraderStore.js'
import { useResolutionStore } from './store/resolutionStore.js'
import { toast } from './store/toastStore.js'
import { formatCurrency, formatSignedCurrency } from './utils/format.js'
import { subscribeToKey } from './utils/storage.js'

let booted = false

const listing = () => {
  const { order, markets } = useMarketStore.getState()
  return order.map((id) => markets[id]).filter(Boolean)
}

const heldMarketIds = () =>
  Object.values(useAccountStore.getState().portfolio?.positions ?? {}).map((p) => p.marketId)

const refreshMarkets = () => useMarketStore.getState().refresh(heldMarketIds())

function notifySettled(settled) {
  for (const s of settled) {
    const title = s.entries[0]?.marketTitle ?? 'A market'
    toast({
      tone: s.realizedPnl >= 0 ? 'success' : 'info',
      title: `Settled: ${title}`,
      description: `Resolved ${s.outcome === 'yes' ? 'Yes' : 'No'} · Payout ${formatCurrency(s.payout)} · Realized ${formatSignedCurrency(s.realizedPnl)}`,
      duration: 7000,
    })
  }
}

function addSimTrade(ts) {
  const entry = generateSimTrade(listing(), ts)
  if (!entry) return
  useFeedStore.getState().addSim(entry)
  useMockTraderStore.getState().recordSimTrade(entry.user)
}

/**
 * Background coordinator: boots stores, polls prices while the tab is
 * visible, syncs other tabs, settles markets the API reports as resolved,
 * takes equity snapshots and drives the simulated activity feed.
 */
export default function AppEffects() {
  const tick = useMarketStore((s) => s.tick)
  const userId = useAccountStore((s) => s.user?.id ?? null)

  useEffect(() => {
    if (booted) return
    booted = true
    useResolutionStore.getState().load()
    useFeedStore.getState().load()
    useMarketStore.getState().init()
    notifySettled(useAccountStore.getState().init())
    refreshMarkets()
  }, [])

  usePolling(refreshMarkets, POLL_INTERVAL_MS)

  useEffect(() => {
    const unsubs = [
      subscribeToKey('feed', () => useFeedStore.getState().load()),
      subscribeToKey('resolutions', () => {
        useResolutionStore.getState().load()
        notifySettled(useAccountStore.getState().applyPendingResolutions())
      }),
      subscribeToKey('session', () => {
        useAccountStore.getState().logOut()
        notifySettled(useAccountStore.getState().init())
      }),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  useEffect(() => {
    if (!userId) return undefined
    return subscribeToKey(portfolioKey(userId), () => useAccountStore.getState().syncFromStorage())
  }, [userId])

  useEffect(() => {
    if (!tick) return
    const markets = listing()
    useMockTraderStore.getState().sync(markets)
    if (!useFeedStore.getState().sim.length) {
      const now = Date.now()
      for (let i = 8; i > 0; i--) addSimTrade(now - i * 47000 - Math.random() * 30000)
    }
    const account = useAccountStore.getState()
    if (!account.portfolio) return
    let resolvedAny = false
    for (const id of new Set(heldMarketIds())) {
      const market = getMarket(id)
      if (market?.resolvedOutcome) {
        resolvedAny =
          useResolutionStore.getState().resolve(id, market.resolvedOutcome, { source: 'api', title: market.title }) ||
          resolvedAny
      }
    }
    if (resolvedAny) notifySettled(account.applyPendingResolutions())
    account.snapshot()
  }, [tick])

  useEffect(() => {
    let timer
    const loop = () => {
      timer = setTimeout(
        () => {
          if (document.visibilityState === 'visible') addSimTrade(Date.now())
          loop()
        },
        3500 + Math.random() * 5500,
      )
    }
    loop()
    return () => clearTimeout(timer)
  }, [])

  return null
}
