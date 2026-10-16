import { CASUAL_HANDLES, PRO_TRADERS } from '../services/mockTraders.js'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/

export const isEmail = (value) => value.includes('@')

/** A name folded for look-alike checks, the same way as the server's private.name_key. */
const nameKey = (name) => {
  const map = { 0: 'o', 1: 'l', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', i: 'l' }
  return name.toLowerCase().replace(/[_.+-]/g, '').replace(/[0134578i]/g, (c) => map[c])
}

const RESERVED = new Set(
  [...PRO_TRADERS.map((t) => t.name), ...CASUAL_HANDLES, 'mod', 'support', 'staff', 'system', 'sim', 'root', 'owner', 'help', 'null', 'undefined'].map(nameKey),
)
const OFFICIAL = ['admin', 'moderator', 'official', 'chaminade', 'chamimarket'].map(nameKey)

/**
 * Names nobody can sign up with: the simulated players (and look-alikes such
 * as quietkeIIy) and anything that looks official. The server keeps the same
 * rules in private.is_reserved_name.
 */
export const isReservedName = (name) => {
  const key = nameKey(name.trim())
  return RESERVED.has(key) || OFFICIAL.some((w) => key.includes(w)) || /(^|[^a-z])sim([^a-z]|$)/i.test(name.trim())
}

/** A username's rules: 3 to 20 letters, numbers or underscores, and not reserved. */
export function validateUsername(raw) {
  const value = (raw ?? '').trim()
  if (!value) return 'Pick a username.'
  if (value.length < 3) return 'Username must be at least 3 characters.'
  if (!USERNAME_RE.test(value)) return 'Usernames use 3 to 20 letters, numbers or underscores.'
  if (isReservedName(value)) return 'That username is reserved. Pick another.'
  return null
}

export function validateIdentifier(raw) {
  const value = raw.trim()
  if (!value) return 'Enter a username or email.'
  if (isEmail(value)) {
    if (value.length > 254 || !EMAIL_RE.test(value)) return 'Enter a valid email address.'
    return null
  }
  return validateUsername(value)
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
