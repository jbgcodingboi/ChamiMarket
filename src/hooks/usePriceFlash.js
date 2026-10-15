import { useEffect, useRef, useState } from 'react'

/** Returns "up" or "down" briefly after a value changes, for flash animations. */
export function usePriceFlash(value) {
  const prev = useRef(value)
  const [flash, setFlash] = useState(null)
  useEffect(() => {
    if (prev.current === value) return undefined
    setFlash(value > prev.current ? 'up' : 'down')
    prev.current = value
    const t = setTimeout(() => setFlash(null), 1100)
    return () => clearTimeout(t)
  }, [value])
  return flash
}

export const flashClass = (flash) =>
  flash === 'up' ? 'animate-flash-up' : flash === 'down' ? 'animate-flash-down' : ''
