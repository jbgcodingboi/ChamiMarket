/**
 * Demo-grade password hashing with the Web Crypto API (PBKDF2-SHA-256 and a
 * random per-account salt). Plaintext passwords are never stored. This keeps
 * casual snooping of localStorage from revealing passwords, but a client-side
 * account system is not secure for real use.
 */
const ITERATIONS = 150000

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const fromHex = (hex) => new Uint8Array(hex.match(/.{2}/g).map((h) => parseInt(h, 16)))

function subtle() {
  const s = globalThis.crypto?.subtle
  if (!s) throw new Error('Secure password hashing needs HTTPS or localhost.')
  return s
}

async function derive(password, salt, iterations) {
  const key = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return toHex(bits)
}

export async function hashPassword(password) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  return { salt: toHex(salt), hash: await derive(password, salt, ITERATIONS), iterations: ITERATIONS }
}

export async function verifyPassword(password, { salt, hash, iterations }) {
  const candidate = await derive(password, fromHex(salt), iterations)
  if (candidate.length !== hash.length) return false
  let diff = 0
  for (let i = 0; i < hash.length; i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i)
  return diff === 0
}
