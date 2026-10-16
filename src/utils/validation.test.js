import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CASUAL_HANDLES, PRO_TRADERS } from '../services/mockTraders.js'
import { displayNameFor, isReservedName, validateIdentifier, validatePassword } from './validation.js'

describe('auth validation', () => {
  it('accepts usernames and emails', () => {
    expect(validateIdentifier('trader_1')).toBeNull()
    expect(validateIdentifier('me@example.com')).toBeNull()
  })
  it('rejects bad input with clear messages', () => {
    expect(validateIdentifier('ab')).toMatch(/at least 3/)
    expect(validateIdentifier('bad name')).toMatch(/letters, numbers/)
    expect(validateIdentifier('me@nowhere')).toMatch(/valid email/)
    expect(validatePassword('short')).toMatch(/at least 8/)
    expect(validatePassword('longenough')).toBeNull()
  })
  it('derives a display name', () => {
    expect(displayNameFor('me@example.com')).toBe('me')
    expect(displayNameFor(' Trader ')).toBe('Trader')
  })
  it('reserves simulated players and official-looking names', () => {
    expect(validateIdentifier('CryptoOracle')).toMatch(/reserved/)
    expect(validateIdentifier('cryptooracle')).toMatch(/reserved/)
    expect(isReservedName('ChaminadeOfficial')).toBe(true)
    expect(isReservedName('site_admin')).toBe(true)
    expect(isReservedName('quietkeIIy')).toBe(true) // capital i for l
    expect(isReservedName('m0d')).toBe(true)
    expect(isReservedName('sim_1')).toBe(true)
    expect(isReservedName('simon')).toBe(false)
    expect(isReservedName('trader_1')).toBe(false)
  })
  it('keeps the server list of reserved names in step', () => {
    const sql = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8')
    const block = sql.slice(sql.indexOf('function private.is_reserved_name'), sql.indexOf('$$;', sql.indexOf('function private.is_reserved_name')))
    for (const name of [...PRO_TRADERS.map((t) => t.name), ...CASUAL_HANDLES]) expect(block).toContain(`'${name.toLowerCase()}'`)
  })
})
