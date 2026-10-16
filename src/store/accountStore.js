import { create } from 'zustand'
import { SNAPSHOT_INTERVAL_MS } from '../config.js'
import { hashPassword, PBKDF2_ITERATIONS, verifyPassword } from '../utils/crypto.js'
import {
  addSnapshot,
  computeNetWorth,
  createPortfolio,
  isValidPortfolio,
  resetPortfolio,
  sanitizePortfolio,
} from '../utils/portfolio.js'
import { randomId } from '../utils/rng.js'
import { own } from '../utils/safe.js'
import { isPlainObject, readJSON, removeKey, writeJSON } from '../utils/storage.js'
import { hasEnded } from '../utils/curation.js'
import { applyResolutions, executeBuy, executeSell, TradeError } from '../utils/trading.js'
import { displayNameFor, isEmail, isReservedName, validateIdentifier, validatePassword } from '../utils/validation.js'
import { BACKEND_ENABLED, usernameFor } from '../services/backend/config.js'
import * as backend from '../services/backend/api.js'
import { useFeedStore } from './feedStore.js'
import { useUiStore } from './uiStore.js'
import { getMarket } from './marketStore.js'
import { getOutcomePrice, marketPrice } from './prices.js'
import { useResolutionStore } from './resolutionStore.js'

const ACCOUNTS_KEY = 'accounts'
const SESSION_KEY = 'session'
export const portfolioKey = (userId) => `portfolio:${userId}`

const isAccount = (a) =>
  isPlainObject(a) &&
  typeof a.id === 'string' &&
  typeof a.username === 'string' &&
  typeof a.identifier === 'string' &&
  typeof a.salt === 'string' &&
  typeof a.hash === 'string' &&
  Number.isInteger(a.iterations) &&
  a.iterations >= 1000 &&
  a.iterations <= 10_000_000

const isSession = (v) => isPlainObject(v) && typeof v.userId === 'string'

/** Local accounts. A damaged entry is skipped, never allowed to wipe out the others. */
export function readAccounts() {
  return readJSON(ACCOUNTS_KEY, Array.isArray, []).filter(isAccount)
}

/** Loads a stored portfolio; a missing or corrupted one is replaced with a fresh account. */
export function readPortfolio(userId) {
  const stored = readJSON(portfolioKey(userId), isValidPortfolio, null)
  return stored ? sanitizePortfolio(stored) : null
}

const publicUser = (a) => ({ id: a.id, username: a.username, kind: a.kind })

/**
 * Backend mode: settlement entries already seen, so each server-side payout
 * is announced once.
 */
let seenSettlements = null

/**
 * Backend mode: bumped on every log out or delete, so a server answer that
 * was still on its way can't sign the player back in on screen.
 */
let sessionEpoch = 0

/** Closes account dialogs that only make sense while signed in. */
const closeAccountDialogs = () => useUiStore.setState({ resetOpen: false, deleteOpen: false })

function newSettlements(portfolio) {
  const entries = portfolio.history.filter((e) => e.type === 'settlement')
  if (!seenSettlements) {
    seenSettlements = new Set(entries.map((e) => e.id))
    return []
  }
  const fresh = entries.filter((e) => !seenSettlements.has(e.id))
  for (const e of fresh) seenSettlements.add(e.id)
  const byMarket = new Map()
  for (const e of fresh) {
    const s = byMarket.get(e.marketId) ?? { marketId: e.marketId, outcome: /void/i.test(e.note ?? '') ? 'void' : /yes/i.test(e.note ?? '') ? 'yes' : 'no', payout: 0, realizedPnl: 0, entries: [] }
    s.payout = Math.round((s.payout + e.amount) * 100) / 100
    s.realizedPnl = Math.round((s.realizedPnl + (e.realizedPnl ?? 0)) * 100) / 100
    s.entries.push(e)
    byMarket.set(e.marketId, s)
  }
  return [...byMarket.values()]
}

/** A server portfolio in the shape the app uses everywhere. */
const fromServer = (p) => sanitizePortfolio({ ...p, cash: Number(p.cash), realizedPnl: Number(p.realizedPnl), runStartCash: Number(p.runStartCash) })

class AuthError extends Error {
  constructor(message, field) {
    super(message)
    this.field = field
  }
}

export const useAccountStore = create((set, get) => ({
  accounts: [],
  user: null,
  portfolio: null,
  ready: false,

  init() {
    if (BACKEND_ENABLED) {
      set({ accounts: [], ready: false })
      backend
        .currentUser()
        .then((user) => (user ? get().loadRemote(user) : null))
        .catch(() => {})
        .finally(() => set({ ready: true }))
      return []
    }
    const accounts = readAccounts()
    const session = readJSON(SESSION_KEY, isSession, null)
    const account = session ? accounts.find((a) => a.id === session.userId) : null
    if (session && !account) removeKey(SESSION_KEY)
    set({ accounts, ready: true })
    return account ? get().activate(account) : []
  },

  /** Backend mode: loads the signed-in player's portfolio from the server. Returns new settlements. */
  async loadRemote(user) {
    const epoch = sessionEpoch
    const raw = await backend.getPortfolio()
    if (epoch !== sessionEpoch) return []
    const portfolio = fromServer(raw)
    set({ user: { ...user, username: raw.username ?? user.username }, portfolio })
    return newSettlements(portfolio)
  },

  /** Backend mode: re-reads the portfolio (picks up server-side settlements). */
  async refreshRemote() {
    const { user } = get()
    if (!BACKEND_ENABLED || !user) return []
    return get().loadRemote(user)
  },

  /** Backend mode: adopts a portfolio returned by a server call. */
  adoptRemote(raw) {
    if (!raw || !get().user) return
    const portfolio = fromServer(raw)
    newSettlements(portfolio)
    set({ portfolio })
  },

  /** Makes an account active, applying any pending market settlements. */
  activate(account) {
    let portfolio = readPortfolio(account.id) ?? createPortfolio()
    const { portfolio: settledPortfolio, settled } = applyResolutions(
      portfolio,
      useResolutionStore.getState().resolutions,
    )
    portfolio = settledPortfolio
    writeJSON(portfolioKey(account.id), portfolio)
    writeJSON(SESSION_KEY, { userId: account.id })
    set({ user: publicUser(account), portfolio })
    return settled
  },

  async signUp({ identifier, password, confirm }) {
    const idError = validateIdentifier(identifier)
    if (idError) throw new AuthError(idError, 'identifier')
    const pwError = validatePassword(password)
    if (pwError) throw new AuthError(pwError, 'password')
    if (password !== confirm) throw new AuthError('Passwords do not match.', 'confirm')
    if (BACKEND_ENABLED) {
      if (password.length > 72) throw new AuthError('Password must be 72 characters or fewer.', 'password')
      const username = usernameFor(identifier)
      if (!(await backend.usernameAvailable(username))) {
        throw new AuthError(
          isEmail(identifier.trim()) ? `The name "${username}" from that email is taken. Sign up with a username instead.` : 'That username is taken.',
          'identifier',
        )
      }
      const user = await backend.signUp({ identifier, password, username })
      seenSettlements = null
      await get().loadRemote(user)
      return get().user
    }
    const normalized = identifier.trim().toLowerCase()
    const accounts = readAccounts()
    if (accounts.some((a) => a.identifier === normalized)) {
      throw new AuthError(
        isEmail(normalized) ? 'An account with this email already exists.' : 'That username is taken.',
        'identifier',
      )
    }
    const username = displayNameFor(identifier)
    if (isReservedName(username)) throw new AuthError(`The name "${username}" is reserved. Sign up with a different username.`, 'identifier')
    if (accounts.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
      throw new AuthError('That display name is already in use. Try a different username or email.', 'identifier')
    }
    const secret = await hashPassword(password)
    const account = {
      id: randomId('u'),
      username,
      identifier: normalized,
      kind: isEmail(normalized) ? 'email' : 'username',
      ...secret,
      createdAt: Date.now(),
    }
    const nextAccounts = [...accounts, account]
    writeJSON(ACCOUNTS_KEY, nextAccounts)
    writeJSON(portfolioKey(account.id), createPortfolio())
    set({ accounts: nextAccounts })
    get().activate(account)
    return publicUser(account)
  },

  async logIn({ identifier, password }) {
    if (!identifier.trim()) throw new AuthError('Enter your username or email.', 'identifier')
    if (!password) throw new AuthError('Enter your password.', 'password')
    if (BACKEND_ENABLED) {
      const user = await backend.logIn({ identifier, password })
      seenSettlements = null
      await get().loadRemote(user)
      return { user: get().user, settled: [] }
    }
    const accounts = readAccounts()
    const account = accounts.find((a) => a.identifier === identifier.trim().toLowerCase())
    const ok = account ? await verifyPassword(password, account) : false
    if (!ok) throw new AuthError('Incorrect username/email or password.', 'password')
    if (account.iterations < PBKDF2_ITERATIONS) {
      // Upgrade an older, weaker hash now that we have the password.
      const upgraded = { ...account, ...(await hashPassword(password)) }
      const latest = readAccounts().map((a) => (a.id === upgraded.id ? upgraded : a))
      writeJSON(ACCOUNTS_KEY, latest)
      set({ accounts: latest })
    } else set({ accounts })
    const settled = get().activate(account)
    return { user: publicUser(account), settled }
  },

  /**
   * Permanently deletes the signed-in account once the player has typed
   * DELETE: the portfolio, history, game state and feed entries go with it,
   * so the player also leaves the leaderboard.
   */
  async deleteAccount({ confirm }) {
    const { user } = get()
    if (!user) throw new AuthError('Log in first.', 'confirm')
    if (confirm?.trim().toUpperCase() !== 'DELETE') throw new AuthError('Type DELETE to confirm.', 'confirm')
    if (BACKEND_ENABLED) {
      await backend.deleteAccount(confirm.trim().toUpperCase())
      sessionEpoch += 1
      seenSettlements = null
      closeAccountDialogs()
      set({ user: null, portfolio: null })
      return
    }
    const rest = readAccounts().filter((a) => a.id !== user.id)
    writeJSON(ACCOUNTS_KEY, rest)
    removeKey(portfolioKey(user.id))
    for (const k of ['fair', 'mines', 'chicken', 'blackjack']) removeKey(`games:${user.id}:${k}`)
    useFeedStore.getState().removeUser(user.username)
    removeKey(SESSION_KEY)
    closeAccountDialogs()
    set({ accounts: rest, user: null, portfolio: null })
  },

  logOut() {
    closeAccountDialogs()
    if (BACKEND_ENABLED) {
      sessionEpoch += 1
      backend.logOut()
      seenSettlements = null
      set({ user: null, portfolio: null })
      return
    }
    removeKey(SESSION_KEY)
    set({ user: null, portfolio: null })
  },

  commit(portfolio) {
    const { user } = get()
    if (!user) return
    if (BACKEND_ENABLED) {
      // In-memory only: the server holds the real portfolio.
      set({ portfolio })
      return
    }
    writeJSON(portfolioKey(user.id), portfolio)
    set({ portfolio })
  },

  /** Re-reads the active portfolio, e.g. after another tab changed it. */
  syncFromStorage() {
    const { user } = get()
    if (!user || BACKEND_ENABLED) return
    const accounts = readAccounts()
    if (!accounts.some((a) => a.id === user.id)) {
      get().logOut()
      return
    }
    const stored = readPortfolio(user.id)
    if (stored) set({ portfolio: stored, accounts })
  },

  netWorth() {
    const { portfolio } = get()
    return portfolio ? computeNetWorth(portfolio.cash, portfolio.positions, getOutcomePrice) : 0
  },

  snapshot({ force = false } = {}) {
    const { portfolio } = get()
    // The server records snapshots in backend mode.
    if (!portfolio || BACKEND_ENABLED) return
    const next = addSnapshot(portfolio, get().netWorth(), Date.now(), {
      force,
      minIntervalMs: SNAPSHOT_INTERVAL_MS,
    })
    if (next !== portfolio) get().commit(next)
  },

  buy({ marketId, side, amount }) {
    const { user, portfolio } = get()
    if (!user || !portfolio) throw new TradeError('Log in to trade.')
    if (BACKEND_ENABLED) return get().remoteBuy({ marketId, side, amount })
    const market = getMarket(marketId)
    if (!market) throw new TradeError('This market is no longer available.')
    if (own(useResolutionStore.getState().resolutions, marketId) || market.closed) {
      throw new TradeError('This market is resolved. Trading is closed.')
    }
    if (market.acceptingOrders === false) throw new TradeError('Trading is paused on this market.')
    if (hasEnded(market)) throw new TradeError('This event has ended. Trading is closed until it settles.')
    const price = marketPrice(market, side)
    const { portfolio: next, entry } = executeBuy(portfolio, {
      marketId,
      marketTitle: market.title,
      side,
      amount,
      price,
      id: randomId('buy'),
    })
    get().commit(next)
    get().snapshot({ force: true })
    useFeedStore.getState().addReal({ ...entry, action: 'buy', user: user.username, sideLabel: market.labels[side] })
    return entry
  },

  async remoteBuy({ marketId, side, amount }) {
    const market = getMarket(marketId)
    const res = await backend.buy({ marketId, side, amount, seenPrice: market ? marketPrice(market, side) : null }).catch((err) => {
      throw new TradeError(err.message)
    })
    get().adoptRemote(res.portfolio)
    return { shares: Number(res.shares), price: Number(res.price), amount: Number(res.amount), marketId, side }
  },

  async remoteSell({ marketId, side, shares }) {
    const market = getMarket(marketId)
    const res = await backend.sell({ marketId, side, shares, seenPrice: market ? marketPrice(market, side) : null }).catch((err) => {
      throw new TradeError(err.message)
    })
    get().adoptRemote(res.portfolio)
    const preview = { shares: Number(res.shares), proceeds: Number(res.proceeds), realizedPnl: Number(res.realizedPnl), isFull: res.isFull }
    return { entry: { ...preview, price: Number(res.price), marketId, side }, preview }
  },

  sell({ marketId, side, shares }) {
    const { user, portfolio } = get()
    if (!user || !portfolio) throw new TradeError('Log in to trade.')
    if (BACKEND_ENABLED) return get().remoteSell({ marketId, side, shares })
    if (own(useResolutionStore.getState().resolutions, marketId)) {
      throw new TradeError('This market is resolved. Positions settle automatically.')
    }
    const market = getMarket(marketId)
    if (market && hasEnded(market)) throw new TradeError('This event has ended. Your position settles automatically.')
    const price = market ? marketPrice(market, side) : null
    const { portfolio: next, entry, preview } = executeSell(portfolio, {
      marketId,
      side,
      shares,
      price,
      id: randomId('sell'),
    })
    get().commit(next)
    get().snapshot({ force: true })
    useFeedStore.getState().addReal({
      ...entry,
      action: 'sell',
      user: user.username,
      sideLabel: market?.labels[side] ?? side,
    })
    return { entry, preview }
  },

  /** Settles the active account against every recorded resolution. */
  applyPendingResolutions() {
    const { portfolio } = get()
    if (!portfolio) return []
    if (BACKEND_ENABLED) return get().refreshRemote()
    const { portfolio: next, settled } = applyResolutions(portfolio, useResolutionStore.getState().resolutions)
    if (settled.length) {
      get().commit(next)
      get().snapshot({ force: true })
    }
    return settled
  },

  resetBalance() {
    const { portfolio } = get()
    if (!portfolio) return
    if (BACKEND_ENABLED) return backend.resetBalance().then((p) => get().adoptRemote(p))
    // One reset a day, the same rule as the server's.
    const last = Math.max(0, ...portfolio.history.filter((h) => h.type === 'reset').map((h) => h.ts))
    if (Date.now() - last < 864e5) {
      throw new Error(`You can reset once every 24 hours. Next reset after ${new Date(last + 864e5).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.`)
    }
    get().commit(resetPortfolio(portfolio, Date.now(), randomId('reset')))
  },
}))
