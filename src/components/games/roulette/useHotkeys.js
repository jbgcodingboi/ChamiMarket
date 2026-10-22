import { useEffect, useRef } from 'react'

/** True when a key press belongs to whatever has focus (typing, a menu, a dialog). */
function ownedByFocus(e) {
  const t = e.target
  if (!(t instanceof Element)) return false
  if (t.closest('input, textarea, select, summary, [contenteditable=""], [contenteditable="true"]')) return true
  return Boolean(document.querySelector('[aria-modal="true"]'))
}

/**
 * Table shortcuts for a game page. `keys` maps a lowercase `KeyboardEvent.key`
 * (" " for Space) to a handler; a handler that returns false lets the key
 * through. Ignored while typing, in a dialog, or with Ctrl/Cmd/Alt held.
 * Space is taken even when a button has focus, so it always means the main
 * action instead of re-clicking the last button.
 */
export function useHotkeys(keys) {
  const ref = useRef(keys)
  useEffect(() => {
    ref.current = keys
  })
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || ownedByFocus(e)) return
      const handler = ref.current[e.key.toLowerCase()]
      if (!handler) return
      if (e.repeat) return e.preventDefault()
      if (handler(e) !== false) e.preventDefault()
    }
    // Stops a focused button from also firing its own click when Space comes back up.
    const onKeyUp = (e) => {
      if (e.key === ' ' && ref.current[' '] && !ownedByFocus(e) && e.target instanceof Element && e.target.closest('button')) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])
}

/** A small keyboard hint, hidden on touch-sized screens. */
export const kbdClass =
  'ml-1.5 hidden rounded border border-current/30 px-1 py-px text-[10px] leading-none font-semibold opacity-70 sm:inline-block'
