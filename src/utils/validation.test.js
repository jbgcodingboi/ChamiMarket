import { describe, expect, it } from 'vitest'
import { displayNameFor, validateIdentifier, validatePassword } from './validation.js'

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
})
