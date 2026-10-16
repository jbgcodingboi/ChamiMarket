import { useEffect } from 'react'
import { POLL_INTERVAL_MS } from './config.js'
import { usePolling } from './hooks/usePolling.js'
import { houseOutcome, isHouseId } from './services/chaminade.js'
import { parlayOutcome } from './services/quick/parlays.js'
import { parseParlayId } from './services/quick/index.js'
import { isMockId } from './services/mockData.js'
import { generateSimTrade } from './services/mockTraders.js'
import { portfolioKey, useAccountStore } from './store/accountStore.js'
import { useFeedStore } from './store/feedStore.js'
import { flush as flushGames } from './store/gameStore.js'
import { getMarket, isOrphanedDemoId, useMarketStore } from './store/marketStore.js'
import { useMockTraderStore } from './store/mockTraderStore.js'
import { useResolutionStore } from './store/resolutionStore.js'
import { toast } from './store/toastStore.js'
import { hasEnded } from './utils/curation.js'
import { formatCurrency, formatSignedCurrency } from './utils/format.js'
import { own } from './utils/safe.js'
import { subscribeToKey } from './utils/storage.js'

let booted = false

const listing = () => {
  const { order, markets } = useMarketStore.getState()
  return order.map((id) => markets[id]).filter(Boolean)
}

/** Markets the active account holds, plus the legs of any parlay it holds. */
const heldMarketIds = () => {
  const ids = Object.values(useAccountStore.getState().portfolio?.positions ?? {}).map((p) => p.marketId)
  const legs = ids.flatMap((id) => parseParlayId(id)?.map((l) => l.id) ?? [])
  return [...new Set([...ids, ...legs])]
}

const refreshMarkets = async () => {
  const held = heldMarketIds()
  const store = useMarketStore.getState()
  store.refreshHouse(held)
  await store.refresh(held)
  await useMarketStore.getState().refreshQuick(held).catch(() => {})
}

function notifySettled(settled) {
  for (const s of settled) {
    const title = s.entries[0]?.marketTitle ?? 'A market'
    const result = s.outcome === 'void' ? 'Voided, refunded at cost' : `Resolved ${s.outcome === 'yes' ? 'Yes' : 'No'}`
    toast({
      tone: s.realizedPnl >= 0 ? 'success' : 'info',
      title: `Settled: ${title}`,
      description: `${result} · Payout ${formatCurrency(s.payout)} · Realized ${formatSignedCurrency(s.realizedPnl)}`,
      duration: 7000,
    })
  }
}

/**
 * The result to settle a held market with, if one is known: Chaminade house
 * markets from the posted final score; parlays from their legs; Quick markets
 * and tonight's pro games from their live sources (Coinbase, NWS, closing
 * prices, ESPN); Polymarket markets from the live API (closed with a clear
 * winner), else from the deployed snapshot. Demo
 * markets have no real result, so once they end (or leave the bundled
 * dataset) they are voided and refunded at cost.
 */
function officialResult(id) {
  const market = getMarket(id)
  const title = market?.title ?? ''
  const store = useMarketStore.getState()
  if (isHouseId(id)) {
    const outcome = houseOutcome(id, store.houseResults)
    return outcome ? { outcome, source: 'chaminade', title } : null
  }
  const legs = parseParlayId(id)
  if (legs) {
    const resolutions = useResolutionStore.getState().resolutions
    const outcome = parlayOutcome(
      legs,
      legs.map((l) => own(resolutions, l.id)?.outcome ?? officialResult(l.id)?.outcome ?? null),
    )
    return outcome ? { outcome, source: 'parlay', title } : null
  }
  const quick = own(store.quickResults, id)
  if (quick) return { outcome: quick, source: 'quick', title }
  if (market?.resolvedOutcome) return { outcome: market.resolvedOutcome, source: 'api', title }
  const fromSnapshot = own(useMarketStore.getState().snapshotResolutions, id)
  if (fromSnapshot) return { outcome: fromSnapshot, source: 'snapshot', title }
  if (isOrphanedDemoId(id) || (isMockId(id) && market && hasEnded(market))) {
    return { outcome: 'void', source: 'demo', title }
  }
  return null
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

  // Pays out game rounds that were still animating when a tab closed.
  useEffect(() => {
    if (userId) flushGames()
  }, [userId])

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
      const result = officialResult(id)
      if (result) {
        resolvedAny = useResolutionStore.getState().resolve(id, result.outcome, result) || resolvedAny
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
