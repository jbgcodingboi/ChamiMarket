/**
 * Supabase settings, read at build time. Both are public by design (the anon
 * key only allows what the database's row level security and function grants
 * permit). When either is missing the app runs in local mode: accounts and
 * portfolios stay in this browser's localStorage, as before.
 */
export const SUPABASE_URL = (import.meta.env?.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
export const SUPABASE_ANON_KEY = (import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '').trim()
export const BACKEND_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

/**
 * Supabase logins are email-based, so a username-only account gets a private
 * placeholder address on this domain. No email is ever sent to it (email
 * confirmation is turned off), and players only ever see their username.
 */
export const USERNAME_EMAIL_DOMAIN = (import.meta.env?.VITE_USERNAME_EMAIL_DOMAIN ?? 'users.chamimarket.app').trim()

const isEmail = (v) => v.includes('@')

/** The address Supabase knows an identifier (username or email) by. */
export const loginEmail = (identifier) => {
  const v = identifier.trim().toLowerCase()
  return isEmail(v) ? v : `${v}@${USERNAME_EMAIL_DOMAIN}`
}

/** A display username for a sign-up identifier: the username itself, or an email's name part. */
export const usernameFor = (identifier) => {
  const v = identifier.trim()
  const base = isEmail(v) ? v.split('@')[0] : v
  return base.replace(/[^A-Za-z0-9_.+-]/g, '_').slice(0, 20) || 'player'
}
