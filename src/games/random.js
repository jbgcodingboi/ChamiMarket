/**
 * Unbiased randomness for the games, from the Web Crypto API.
 * randomInt uses rejection sampling, so every outcome is exactly equally likely.
 */
const buf = new Uint32Array(1)

function next32() {
  globalThis.crypto.getRandomValues(buf)
  return buf[0]
}

/** Uniform integer in [0, n). */
export function randomInt(n) {
  const limit = Math.floor(0x100000000 / n) * n
  let x = next32()
  while (x >= limit) x = next32()
  return x % n
}

/** Uniform float in [0, 1). */
export const randomFloat = () => next32() / 0x100000000

/** Fisher-Yates shuffle of a copy. */
export function shuffle(list, rand = randomInt) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
