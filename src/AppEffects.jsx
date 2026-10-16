import { useEffect } from 'react'
import { POLL_INTERVAL_MS } from './config.js'
import { usePolling } from './hooks/usePolling.js'
import { houseOutcome, isHouseId } from './services/chaminade.js'
import { parlayOutcome } from './services/quick/parlays.js'
import { parseParlayId } from './services/quick/index.js'
import { isMockId } from './services/mockData.js'
import { generateSimTrade } from './services/mockTraders.js'
import * as backend from './services/backend/api.js'
import { BACKEND_ENABLED } from './services/backend/config.js'
import { portfolioKey, useAccountStore } from './store/accountStore.js'
import { useFeedStore } from './store/feedStore.js'
import { flush as flushGames } from './store/gameStore.js'
import { getMarket, isOrphanedDemoId, useMarketStore } from './store/marketStore.js'
import { useMockTraderStore } from './store/mockTraderStore.js'
import { useLegalStore } from './store/legalStore.js'
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

/**
 * Backend mode: results and payouts happen on the server. Each refresh pulls
 * the latest results, asks the server to check held Polymarket markets that
 * have ended, then re-reads the portfolio to announce any payouts.
 */
const lastCheck = new Map()
let backendBusy = false
async function backendTick() {
  if (backendBusy) return
  backendBusy = true
  try {
    const ids = heldMarketIds()
    const resolutions = await backend.serverResolutions({ ids })
    useResolutionStore.getState().replace(resolutions)
    const account = useAccountStore.getState()
    if (!account.user) return
    const now = Date.now()
    const due = ids
      .filter((id) => /^\d+$/.test(id) && !own(resolutions, id) && hasEnded(getMarket(id) ?? {}) && now - (lastCheck.get(id) ?? 0) > 120000)
      .slice(0, 3)
    for (const id of due) {
      lastCheck.set(id, now)
      await backend.checkMarket(id).catch(() => false)
    }
    notifySettled(await account.refreshRemote())
  } catch {
    // Try again on the next refresh.
  } finally {
    backendBusy = false
  }
}

/** Backend mode: true when real players made a few trades in the last five minutes, so filler isn't needed. */
function realTradesBusy() {
  const since = Date.now() - 5 * 60000
  return useFeedStore.getState().real.filter((e) => e.ts > since).length >= 3
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
    if (BACKEND_ENABLED) {
      useMarketStore.getState().init()
      useAccountStore.getState().init()
      refreshMarkets()
      return
    }
    useResolutionStore.getState().load()
    useFeedStore.getState().load()
    useMarketStore.getState().init()
    notifySettled(useAccountStore.getState().init())
    refreshMarkets()
  }, [])

  // Backend mode: the live feed, and sign-outs or sign-ins from other tabs.
  useEffect(() => {
    if (!BACKEND_ENABLED) return undefined
    const stops = [useFeedStore.getState().connect()]
    // A sleeping tab can lose its live connection, so catch up when it's shown again.
    const onVisible = () => document.visibilityState === 'visible' && useFeedStore.getState().refresh()
    document.addEventListener('visibilitychange', onVisible)
    stops.push(() => document.removeEventListener('visibilitychange', onVisible))
    stops.push(
      backend.onAuthChange((event, user) => {
        const account = useAccountStore.getState()
        if (event === 'SIGNED_OUT') useAccountStore.setState({ user: null, portfolio: null })
        else if (event === 'SIGNED_IN' && user && account.user?.id !== user.id) account.loadRemote(user).catch(() => {})
      }),
    )
    return () => stops.forEach((p) => Promise.resolve(p).then((stop) => stop?.()))
  }, [])

  usePolling(refreshMarkets, POLL_INTERVAL_MS)

  // Agreeing to the Terms in one tab closes the pop-up in the others.
  useEffect(() => subscribeToKey('terms', () => useLegalStore.getState().reload()), [])

  useEffect(() => {
    if (BACKEND_ENABLED) return undefined
    const unsubs = [
      subscribeToKey('feed', () => useFeedStore.getState().load()),
      subscribeToKey('resolutions', () => {
        useResolutionStore.getState().load()
        Promise.resolve(useAccountStore.getState().applyPendingResolutions()).then(notifySettled)
      }),
      // Another tab signed in or out. Follow it in memory only: clearing the shared
      // session here would sign every other tab out too.
      subscribeToKey('session', () => {
        useAccountStore.setState({ user: null, portfolio: null })
        notifySettled(useAccountStore.getState().init())
      }),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  // Pays out game rounds that were still animating when a tab closed.
  useEffect(() => {
    if (userId && !BACKEND_ENABLED) flushGames()
  }, [userId])

  useEffect(() => {
    if (!userId || BACKEND_ENABLED) return undefined
    return subscribeToKey(portfolioKey(userId), () => useAccountStore.getState().syncFromStorage())
  }, [userId])

  useEffect(() => {
    if (!tick) return
    useMockTraderStore.getState().sync(listing())
    if (!useFeedStore.getState().sim.length) {
      // Backend mode only needs a light buffer under the real trades.
      const now = Date.now()
      const [count, gap] = BACKEND_ENABLED ? [4, 4 * 60000] : [8, 47000]
      for (let i = count; i > 0; i--) addSimTrade(now - i * gap - Math.random() * 30000)
    }
    if (BACKEND_ENABLED) {
      backendTick()
      return
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
          if (document.visibilityState === 'visible' && !(BACKEND_ENABLED && realTradesBusy())) addSimTrade(Date.now())
          loop()
        },
        BACKEND_ENABLED ? 40000 + Math.random() * 50000 : 3500 + Math.random() * 5500,
      )
    }
    loop()
    return () => clearTimeout(timer)
  }, [])

  return null
}
