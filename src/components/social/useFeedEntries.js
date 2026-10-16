import { useMemo } from 'react'
import { useFeedStore } from '../../store/feedStore.js'

/** Real and simulated market trades merged, newest first. Game results have their own feed. */
export function useFeedEntries(limit) {
  const real = useFeedStore((s) => s.real)
  const sim = useFeedStore((s) => s.sim)
  return useMemo(() => [...real, ...sim].sort((a, b) => b.ts - a.ts).slice(0, limit), [real, sim, limit])
}
