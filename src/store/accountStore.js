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
import { displayNameFor, isEmail, validateIdentifier, validatePassword } from '../utils/validation.js'
import { useFeedStore } from './feedStore.js'
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

const isAccounts = (v) => Array.isArray(v) && v.every(isAccount)
const isSession = (v) => isPlainObject(v) && typeof v.userId === 'string'

export function readAccounts() {
  return readJSON(ACCOUNTS_KEY, isAccounts, [])
}

/** Loads a stored portfolio; a missing or corrupted one is replaced with a fresh account. */
export function readPortfolio(userId) {
  const stored = readJSON(portfolioKey(userId), isValidPortfolio, null)
  return stored ? sanitizePortfolio(stored) : null
}

const publicUser = (a) => ({ id: a.id, username: a.username, kind: a.kind })

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
    const accounts = readAccounts()
    const session = readJSON(SESSION_KEY, isSession, null)
    const account = session ? accounts.find((a) => a.id === session.userId) : null
    if (session && !account) removeKey(SESSION_KEY)
    set({ accounts, ready: true })
    return account ? get().activate(account) : []
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
    const normalized = identifier.trim().toLowerCase()
    const accounts = readAccounts()
    if (accounts.some((a) => a.identifier === normalized)) {
      throw new AuthError(
        isEmail(normalized) ? 'An account with this email already exists.' : 'That username is taken.',
        'identifier',
      )
    }
    const username = displayNameFor(identifier)
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

  logOut() {
    removeKey(SESSION_KEY)
    set({ user: null, portfolio: null })
  },

  commit(portfolio) {
    const { user } = get()
    if (!user) return
    writeJSON(portfolioKey(user.id), portfolio)
    set({ portfolio })
  },

  /** Re-reads the active portfolio, e.g. after another tab changed it. */
  syncFromStorage() {
    const { user } = get()
    if (!user) return
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
    if (!portfolio) return
    const next = addSnapshot(portfolio, get().netWorth(), Date.now(), {
      force,
      minIntervalMs: SNAPSHOT_INTERVAL_MS,
    })
    if (next !== portfolio) get().commit(next)
  },

  buy({ marketId, side, amount }) {
    const { user, portfolio } = get()
    if (!user || !portfolio) throw new TradeError('Log in to trade.')
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

  sell({ marketId, side, shares }) {
    const { user, portfolio } = get()
    if (!user || !portfolio) throw new TradeError('Log in to trade.')
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
    get().commit(resetPortfolio(portfolio, Date.now(), randomId('reset')))
  },
}))
