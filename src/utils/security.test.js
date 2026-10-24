import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { API_HOSTS, META_CSP, SECURITY_HEADERS } from '../../security.config.js'
import { getMarket, isMarketShape } from '../store/marketStore.js'
import { useResolution, useResolutionStore } from '../store/resolutionStore.js'
import { hashPassword, PBKDF2_ITERATIONS, verifyPassword } from './crypto.js'
import { isSafeKey, own } from './safe.js'
import { parseSnapshot } from '../services/snapshot.js'

const root = new URL('../../', import.meta.url)
const read = (f) => readFileSync(new URL(f, root), 'utf8')

describe('security headers', () => {
  it('keeps vercel.json, netlify.toml and public/_headers in step with security.config.js', () => {
    const vercel = JSON.parse(read('vercel.json')).headers[0].headers
    expect(Object.fromEntries(vercel.map((h) => [h.key, h.value]))).toEqual(SECURITY_HEADERS)
    const netlify = read('netlify.toml')
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) expect(netlify).toContain(`${k} = "${v}"`)
    // Cloudflare Pages reads public/_headers.
    const cloudflare = read('public/_headers')
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) expect(cloudflare).toContain(`  ${k}: ${v}\n`)
  })
  it('lists every API host the app fetches from in connect-src', () => {
    const files = [
      'src/services/gamma.js',
      'src/services/clob.js',
      'src/services/quick/crypto.js',
      'src/services/quick/weather.js',
      'src/services/quick/espn.js',
    ]
    const used = new Set(files.flatMap((f) => [...read(f).matchAll(/https:\/\/[a-z0-9.-]+/g)].map((m) => m[0])))
    for (const host of used) expect(API_HOSTS).toContain(host)
    expect(META_CSP).toContain("script-src 'self'")
    expect(META_CSP).not.toContain('unsafe-')
  })
})

describe('dictionary keys from outside data', () => {
  it('rejects reserved ids and only reads own properties', () => {
    for (const k of ['__proto__', 'constructor', 'prototype', '', 7, null]) expect(isSafeKey(k)).toBe(false)
    expect(isSafeKey('512345')).toBe(true)
    expect(own({}, 'constructor')).toBeUndefined()
    expect(own({ a: 1 }, 'a')).toBe(1)
    expect(getMarket('constructor')).toBeNull()
    expect(getMarket('toString')).toBeNull()
    expect(useResolutionStore.getState().resolve('__proto__', 'yes')).toBe(false)
    expect(useResolution).toBeTypeOf('function')
    const parsed = parseSnapshot(JSON.parse('{"generatedAt":1,"markets":[],"resolutions":{"__proto__":"yes","42":"no"}}'))
    expect(Object.getPrototypeOf(parsed.resolutions)).toBe(Object.prototype)
    expect(parsed.resolutions).toEqual({ 42: 'no' })
  })
  it('rejects stored markets with a non-https image', () => {
    const m = { id: '1', title: 'T', category: 'sports', yesPrice: 0.5, noPrice: 0.5, labels: { yes: 'Yes', no: 'No' } }
    expect(isMarketShape(m)).toBe(true)
    expect(isMarketShape({ ...m, image: 'https://cdn.example.com/a.png' })).toBe(true)
    expect(isMarketShape({ ...m, image: 'javascript:alert(1)' })).toBe(false)
    expect(isMarketShape({ ...m, image: 'http://cdn.example.com/a.png' })).toBe(false)
    expect(isMarketShape({ ...m, id: 'constructor' })).toBe(false)
  })
})

describe('password hashing', () => {
  it('uses 600,000 PBKDF2 iterations and verifies in constant time', async () => {
    const secret = await hashPassword('correct horse')
    expect(secret.iterations).toBe(PBKDF2_ITERATIONS)
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600000)
    expect(await verifyPassword('correct horse', secret)).toBe(true)
    expect(await verifyPassword('wrong horse', secret)).toBe(false)
  })
})

describe('older password hashes', () => {
  it('are upgraded to the current iteration count on login', async () => {
    const { useAccountStore, readAccounts } = await import('../store/accountStore.js')
    const { writeJSON } = await import('./storage.js')
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('password123'), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150000 }, key, 256)
    const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
    writeJSON('accounts', [{ id: 'u_old', username: 'oldtimer', identifier: 'oldtimer', kind: 'username', salt: hex(salt), hash: hex(bits), iterations: 150000 }])
    await useAccountStore.getState().logIn({ identifier: 'oldtimer', password: 'password123' })
    const [account] = readAccounts()
    expect(account.iterations).toBe(PBKDF2_ITERATIONS)
    expect(await verifyPassword('password123', account)).toBe(true)
    useAccountStore.getState().logOut()
  })
})
