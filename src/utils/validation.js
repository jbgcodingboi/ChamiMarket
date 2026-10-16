import { CASUAL_HANDLES, PRO_TRADERS } from '../services/mockTraders.js'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/

export const isEmail = (value) => value.includes('@')

const RESERVED = new Set([
  ...PRO_TRADERS.map((t) => t.name.toLowerCase()),
  ...CASUAL_HANDLES.map((h) => h.toLowerCase()),
  'mod', 'support', 'staff', 'system', 'sim', 'root', 'owner', 'help', 'null', 'undefined',
])

/**
 * Names nobody can sign up with: the simulated players and anything that
 * looks official. The server keeps the same list (private.is_reserved_name).
 */
export const isReservedName = (name) => RESERVED.has(name.trim().toLowerCase()) || /admin|moderator|official|chaminade|chamimarket/i.test(name)

export function validateIdentifier(raw) {
  const value = raw.trim()
  if (!value) return 'Enter a username or email.'
  if (isEmail(value)) {
    if (value.length > 254 || !EMAIL_RE.test(value)) return 'Enter a valid email address.'
    return null
  }
  if (value.length < 3) return 'Username must be at least 3 characters.'
  if (!USERNAME_RE.test(value)) return 'Usernames use 3 to 20 letters, numbers or underscores.'
  if (isReservedName(value)) return 'That username is reserved. Pick another.'
  return null
}

export function validatePassword(value) {
  if (!value) return 'Enter a password.'
  if (value.length < 8) return 'Password must be at least 8 characters.'
  if (value.length > 128) return 'Password must be 128 characters or fewer.'
  return null
}

/** Public display name: the username, or the part of an email before the @. */
export function displayNameFor(identifier) {
  const value = identifier.trim()
  return isEmail(value) ? value.split('@')[0].slice(0, 20) : value
}
