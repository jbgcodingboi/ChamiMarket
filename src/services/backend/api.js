/**
 * The Supabase backend: sign-in, portfolio, trades, games, leaderboard and
 * the live feed. Every change to money runs in a database function (see
 * supabase/schema.sql); the browser only asks. The Supabase library is
 * loaded on first use, so local mode never downloads it.
 */
import { BACKEND_ENABLED, loginEmail, SUPABASE_ANON_KEY, SUPABASE_URL, USERNAME_EMAIL_DOMAIN } from './config.js'

export class BackendError extends Error {
  constructor(message, field) {
    super(message)
    this.name = 'BackendError'
    this.field = field
  }
}

let clientPromise = null

export function client() {
  if (!BACKEND_ENABLED) return Promise.reject(new BackendError('The backend is not configured.'))
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'chami-auth' },
    }),
  )
  return clientPromise
}

/** Turns database and network errors into messages a player can act on. */
export function friendly(error) {
  const msg = String(error?.message ?? error ?? '')
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(msg)) return "Can't reach the server. Check your connection and try again."
  if (/permission denied|jwt|not authenticated|log in first/i.test(msg)) return 'Log in first.'
  if (/invalid login credentials/i.test(msg)) return 'Incorrect username/email or password.'
  if (/already registered|already been registered/i.test(msg)) return 'An account with that username or email already exists.'
  if (/database error saving new user/i.test(msg)) return 'That username is taken or not allowed. Try another one.'
  if (/rate limit|too many requests/i.test(msg)) return 'Too many attempts. Wait a minute and try again.'
  if (/email.*invalid|invalid.*email/i.test(msg)) return 'Supabase rejected that sign-in address. Try a different username or use your email.'
  if (/password should be/i.test(msg)) return 'Pick a longer password (at least 8 characters).'
  return msg.replace(/^ERROR:\s*/, '') || 'Something went wrong. Try again.'
}

async function rpc(name, args) {
  const sb = await client()
  const { data, error } = await sb.rpc(name, args)
  if (error) throw new BackendError(friendly(error))
  return data
}

// Accounts -------------------------------------------------------------------

const toUser = (authUser, username) => ({
  id: authUser.id,
  username: username ?? authUser.user_metadata?.username ?? 'player',
  kind: authUser.email?.endsWith(`@${USERNAME_EMAIL_DOMAIN}`) ? 'username' : 'email',
})

export async function signUp({ identifier, password, username }) {
  const sb = await client()
  const { data, error } = await sb.auth.signUp({ email: loginEmail(identifier), password, options: { data: { username } } })
  if (error) throw new BackendError(friendly(error), /password/i.test(error.message) ? 'password' : 'identifier')
  if (!data.session) {
    throw new BackendError('Your account was created, but Supabase is asking for email confirmation. Turn off "Confirm email" in the Supabase dashboard so players can log in right away.')
  }
  return toUser(data.user, username)
}

export async function logIn({ identifier, password }) {
  const sb = await client()
  const { data, error } = await sb.auth.signInWithPassword({ email: loginEmail(identifier), password })
  if (error) throw new BackendError(friendly(error), 'password')
  return toUser(data.user)
}

export async function logOut() {
  const sb = await client()
  await sb.auth.signOut().catch(() => {})
}

/** The signed-in Supabase user from the saved session, or null. */
export async function currentUser() {
  const sb = await client()
  const { data } = await sb.auth.getSession()
  return data.session?.user ? toUser(data.session.user) : null
}

/** Calls back with the user (or null) whenever the session changes, including in other tabs. */
export async function onAuthChange(callback) {
  const sb = await client()
  const { data } = sb.auth.onAuthStateChange((event, session) => callback(event, session?.user ? toUser(session.user) : null))
  return () => data.subscription.unsubscribe()
}

export const usernameAvailable = (username) => rpc('username_available', { p_username: username })
export const createRecoveryCode = () => rpc('create_recovery_code')

/** Resets a password with a recovery code. Returns the replacement code. */
export async function resetPassword({ identifier, code, password }) {
  const res = await rpc('reset_password_with_code', { p_email: loginEmail(identifier), p_code: code, p_new_password: password })
  if (res?.error) throw new BackendError(res.error, /password/i.test(res.error) ? 'password' : 'code')
  return res.code
}

// Portfolio and trading --------------------------------------------------------

export const getPortfolio = () => rpc('get_portfolio')
export const buy = ({ marketId, side, amount, seenPrice }) =>
  rpc('buy', { p_market_id: marketId, p_side: side, p_amount: amount, p_seen_price: seenPrice ?? null })
export const sell = ({ marketId, side, shares, seenPrice }) =>
  rpc('sell', { p_market_id: marketId, p_side: side, p_shares: shares, p_seen_price: seenPrice ?? null })
export const resetBalance = () => rpc('reset_balance')
export const checkMarket = (marketId) => rpc('check_market', { p_market_id: marketId })

// Games -----------------------------------------------------------------------

export const playRoulette = (bets) => rpc('play_roulette', { p_bets: bets })
export const playPlinko = ({ amount, rows, risk, balls }) => rpc('play_plinko', { p_amount: amount, p_rows: rows, p_risk: risk, p_balls: balls })
export const blackjackState = () => rpc('blackjack_state')
export const blackjackDeal = (bet) => rpc('blackjack_deal', { p_bet: bet })
export const blackjackAct = (action) => rpc('blackjack_act', { p_action: action })

// Shared data -------------------------------------------------------------------

export const leaderboard = () => rpc('leaderboard')

/** Markets the server lists (Chaminade and Quick), plus any extra ids asked for. */
export async function serverMarkets({ categories, ids = [] }) {
  const sb = await client()
  const open = sb.from('markets').select('id,data,yes_price,no_price,closed,updated_at').in('category', categories).gt('end_date', new Date().toISOString())
  const [listed, extra] = await Promise.all([
    open.limit(1000),
    ids.length ? sb.from('markets').select('id,data,yes_price,no_price,closed,updated_at').in('id', ids.slice(0, 200)) : { data: [] },
  ])
  if (listed.error) throw new BackendError(friendly(listed.error))
  const rows = [...(listed.data ?? []), ...(extra.data ?? [])]
  const seen = new Set()
  return rows
    .filter((r) => !seen.has(r.id) && seen.add(r.id))
    .map((r) => ({ ...r.data, id: r.id, yesPrice: Number(r.yes_price), noPrice: Number(r.no_price), closed: r.closed }))
}

/** Results recorded on the server in the last `days` days, plus any for the given ids. */
export async function serverResolutions({ days = 14, ids = [] } = {}) {
  const sb = await client()
  const since = new Date(Date.now() - days * 864e5).toISOString()
  const [recent, held] = await Promise.all([
    sb.from('resolutions').select('market_id,outcome,source,title,resolved_at').gte('resolved_at', since).limit(2000),
    ids.length ? sb.from('resolutions').select('market_id,outcome,source,title,resolved_at').in('market_id', ids.slice(0, 200)) : { data: [] },
  ])
  if (recent.error) throw new BackendError(friendly(recent.error))
  const out = {}
  for (const r of [...(recent.data ?? []), ...(held.data ?? [])]) {
    out[r.market_id] = { outcome: r.outcome, at: Date.parse(r.resolved_at), source: r.source, title: r.title }
  }
  return out
}

const toFeedEntry = (r) => ({
  id: `a${r.id}`,
  ts: Date.parse(r.created_at),
  user: r.username,
  action: r.kind,
  side: r.side,
  sideLabel: r.side_label,
  shares: Number(r.shares ?? 0),
  price: Number(r.price ?? 0),
  amount: Number(r.amount ?? 0),
  net: Number(r.net ?? 0),
  game: r.game,
  detail: r.detail,
  marketId: r.market_id,
  marketTitle: r.market_title ?? '',
  sim: false,
})

export async function recentActivity(limit = 100) {
  const sb = await client()
  const { data, error } = await sb.from('activity').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw new BackendError(friendly(error))
  return (data ?? []).map(toFeedEntry)
}

/** Live feed: calls back with each new activity row. Returns an unsubscribe function. */
export async function subscribeActivity(onEntry) {
  const sb = await client()
  const channel = sb
    .channel('activity-feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' }, (payload) => onEntry(toFeedEntry(payload.new)))
    .subscribe()
  return () => sb.removeChannel(channel)
}
