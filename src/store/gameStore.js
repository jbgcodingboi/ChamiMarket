import { create } from 'zustand'
import { roundMoney } from '../utils/math.js'
import { isPlainObject, readJSON, writeJSON } from '../utils/storage.js'
import { useAccountStore } from './accountStore.js'

/**
 * Play-money chip wallets for the Games section: one per account plus one
 * for guests, kept separate from trading cash so casino results never touch
 * portfolio PnL or the leaderboard.
 */
export const STARTING_CHIPS = 10000
export const REFILL_BELOW = 1000
const MAX_HISTORY = 200

let counter = 0

const walletKey = (userId) => `games:${userId ?? 'guest'}`

const freshWallet = () => ({ balance: STARTING_CHIPS, history: [], refills: 0, stats: {}, pending: [] })

const isWallet = (w) =>
  isPlainObject(w) && Number.isFinite(w.balance) && w.balance >= 0 && Array.isArray(w.history) && Number.isInteger(w.refills) && isPlainObject(w.stats)

const loadWallet = (userId) => {
  const w = readJSON(walletKey(userId), isWallet, null) ?? freshWallet()
  return Array.isArray(w.pending) ? w : { ...w, pending: [] }
}

function record(wallet, { game, staked, returned, detail }) {
  const net = roundMoney(returned - staked)
  const entry = { id: `${Date.now().toString(36)}${counter++}`, ts: Date.now(), game, staked: roundMoney(staked), returned: roundMoney(returned), net, detail }
  const prev = wallet.stats[game] ?? { rounds: 0, wagered: 0, net: 0, best: 0 }
  const stats = {
    ...wallet.stats,
    [game]: {
      rounds: prev.rounds + 1,
      wagered: roundMoney(prev.wagered + staked),
      net: roundMoney(prev.net + net),
      best: Math.max(prev.best, net),
    },
  }
  return {
    wallet: { ...wallet, balance: roundMoney(wallet.balance + returned), history: [entry, ...wallet.history].slice(0, MAX_HISTORY), stats },
    entry,
  }
}

export const useGameStore = create((set, get) => ({
  owner: null,
  loaded: false,
  wallet: loadWallet(null),

  /** Switches to the wallet of the signed-in account (or the guest wallet). */
  syncOwner() {
    const userId = useAccountStore.getState().user?.id ?? null
    if (get().owner === userId && get().loaded) return
    set({ owner: userId, wallet: loadWallet(userId), loaded: true })
    get().flush()
  },

  save(wallet) {
    writeJSON(walletKey(get().owner), wallet)
    set({ wallet })
  },

  /** Takes a stake from the balance. Returns false if there isn't enough. */
  debit(amount) {
    const { wallet } = get()
    const stake = roundMoney(amount)
    if (!(stake > 0) || stake > wallet.balance + 1e-9) return false
    get().save({ ...wallet, balance: roundMoney(wallet.balance - stake) })
    return true
  },

  /**
   * Pays out a finished bet and records it: staked was already debited,
   * returned is credited (stake plus winnings, 0 for a loss).
   */
  settle(bet) {
    const { wallet, entry } = record(get().wallet, bet)
    get().save(wallet)
    return entry
  },

  /**
   * Debits a bet whose outcome is already drawn but still animating, and
   * holds the payout until `finish(id)`. A round left mid-animation (page
   * closed or changed) is paid out by `flush`, so chips are never lost.
   */
  place({ game, staked, returned, detail }) {
    const { wallet } = get()
    const stake = roundMoney(staked)
    if (!(stake > 0) || stake > wallet.balance + 1e-9) return null
    const id = `p${Date.now().toString(36)}${counter++}`
    get().save({ ...wallet, balance: roundMoney(wallet.balance - stake), pending: [...wallet.pending, { id, game, staked: stake, returned, detail }] })
    return id
  },

  finish(id) {
    const { wallet } = get()
    const bet = wallet.pending.find((p) => p.id === id)
    if (!bet) return null
    const { wallet: next, entry } = record({ ...wallet, pending: wallet.pending.filter((p) => p.id !== id) }, bet)
    get().save(next)
    return entry
  },

  /** Pays out every held bet (for one game, or all). */
  flush(game) {
    for (const p of get().wallet.pending) if (!game || p.game === game) get().finish(p.id)
  },

  /** Tops the balance back up to the starting chips once it falls below the refill line. */
  refill() {
    const { wallet } = get()
    if (wallet.balance >= REFILL_BELOW) return false
    get().save({ ...wallet, balance: STARTING_CHIPS, refills: wallet.refills + 1 })
    return true
  },
}))
