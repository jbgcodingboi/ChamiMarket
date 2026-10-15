import { useMemo } from 'react'
import { useFeedStore } from '../../store/feedStore.js'

/** Real local trades and simulated trades merged, newest first. */
export function useFeedEntries(limit) {
  const real = useFeedStore((s) => s.real)
  const sim = useFeedStore((s) => s.sim)
  return useMemo(() => [...real, ...sim].sort((a, b) => b.ts - a.ts).slice(0, limit), [real, sim, limit])
}
