import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from './uiStore.js'

describe('uiStore sport sub-category', () => {
  beforeEach(() => useUiStore.setState({ category: 'all', sport: 'all' }))

  it('keeps the sport while on the Sports tab and clears it when leaving', () => {
    const { setCategory, setSport } = useUiStore.getState()
    setCategory('sports')
    setSport('nba')
    setCategory('sports')
    expect(useUiStore.getState().sport).toBe('nba')
    setCategory('politics')
    expect(useUiStore.getState()).toMatchObject({ category: 'politics', sport: 'all' })
    setCategory('sports')
    expect(useUiStore.getState().sport).toBe('all')
  })
})
