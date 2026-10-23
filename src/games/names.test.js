import { describe, expect, it } from 'vitest'
import { GAME_NAME, GAME_PATH, gamePath } from './names.js'

describe('game addresses', () => {
  it('gives every game a page, and each live game its own', () => {
    for (const game of Object.keys(GAME_NAME)) expect(GAME_PATH[game]).toMatch(/^\/games\/[a-z0-9]+$/)
    const live = Object.entries(GAME_PATH).filter(([game]) => game !== 'boneyard')
    expect(new Set(live.map(([, path]) => path)).size).toBe(live.length)
    expect(GAME_PATH.boneyard).toBe(GAME_PATH.slots)
  })
  it('never reuses an old game name, so the old addresses can redirect', () => {
    for (const path of Object.values(GAME_PATH)) expect(Object.keys(GAME_NAME)).not.toContain(path.split('/').pop())
  })
  it('sends unknown games to the lobby', () => {
    expect(gamePath('roulette')).toBe('/games/spin')
    expect(gamePath('nope')).toBe('/games')
  })
})
