/**
 * Provably fair randomness, the same scheme Stake-style games publish:
 *
 *   bytes  = HMAC_SHA256(key = serverSeed, message = `${clientSeed}:${nonce}:${cursor}`)
 *   float  = b0/256 + b1/256^2 + b2/256^3 + b3/256^4   (4 bytes per float, 8 per HMAC)
 *
 * The server seed is secret while in use; players see its SHA-256 hash first,
 * pick their own client seed, and every bet uses the next nonce. Rotating the
 * seeds reveals the old server seed, so anyone can recompute every result and
 * check it matches the hash shown beforehand. supabase/schema.sql implements
 * the same formulas in SQL for the backend.
 */
const enc = new TextEncoder()
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

function randomHex(bytes) {
  const a = new Uint8Array(bytes)
  globalThis.crypto.getRandomValues(a)
  return toHex(a)
}

export const newServerSeed = () => randomHex(32)
export const newClientSeed = () => randomHex(8)

export async function sha256Hex(text) {
  return toHex(await globalThis.crypto.subtle.digest('SHA-256', enc.encode(text)))
}

const keys = new Map()
async function hmac(key, message) {
  let k = keys.get(key)
  if (!k) {
    k = await globalThis.crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    if (keys.size > 20) keys.clear()
    keys.set(key, k)
  }
  return new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', k, enc.encode(message)))
}

/** `count` floats in [0, 1) for one bet. */
export async function fairFloats({ serverSeed, clientSeed, nonce }, count) {
  const out = []
  for (let cursor = 0; out.length < count; cursor++) {
    const b = await hmac(serverSeed, `${clientSeed}:${nonce}:${cursor}`)
    for (let i = 0; i < 32 && out.length < count; i += 4) {
      out.push(b[i] / 256 + b[i + 1] / 65536 + b[i + 2] / 16777216 + b[i + 3] / 4294967296)
    }
  }
  return out
}

/** A client seed players may choose: 1 to 64 visible characters. */
export const isClientSeed = (s) => typeof s === 'string' && /^[\x21-\x7e]{1,64}$/.test(s)
