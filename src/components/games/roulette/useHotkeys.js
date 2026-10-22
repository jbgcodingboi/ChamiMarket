import { useEffect, useRef } from 'react'

/** True when a key press belongs to whatever has focus (typing, a menu, a dialog). */
function ownedByFocus(e) {
  const t = e.target
  if (!(t instanceof Element)) return false
  if (t.closest('input, textarea, select, summary, [contenteditable=""], [contenteditable="true"]')) return true
  return Boolean(document.querySelector('[aria-modal="true"]'))
}

const CONTROL = 'button, a[href], [role="button"], [role="radio"], [role="tab"], [role="checkbox"], [role="menuitem"]'

// The control last pressed with a mouse or finger; Tab moves on from it.
let clicked = null
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => (clicked = e.target instanceof Element ? e.target.closest(CONTROL) : null), true)
  window.addEventListener('keydown', (e) => e.key === 'Tab' && (clicked = null), true)
}

/** Space on a control reached with the keyboard presses that control, as usual (after a mouse click it still plays). */
function pressesFocused(e) {
  const control = e.key === ' ' && e.target instanceof Element ? e.target.closest(CONTROL) : null
  return Boolean(control) && control !== clicked
}

/**
 * Table shortcuts for a game page. `keys` maps a lowercase `KeyboardEvent.key`
 * (" " for Space) to a handler; a handler that returns false lets the key
 * through. Ignored while typing, in a dialog, or with Ctrl/Cmd/Alt held.
 * Space is taken even when a clicked button keeps focus, so it means the main
 * action instead of re-clicking the last button; a control the player tabbed
 * to still gets its own Space press.
 */
export function useHotkeys(keys) {
  const ref = useRef(keys)
  useEffect(() => {
    ref.current = keys
  })
  useEffect(() => {
    // Whether the last Space press was used as a shortcut.
    let tookSpace = false
    const onKey = (e) => {
      if (e.key === ' ') tookSpace = false
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || ownedByFocus(e) || pressesFocused(e)) return
      const handler = ref.current[e.key.toLowerCase()]
      if (!handler) return
      if (e.repeat) return e.preventDefault()
      if (handler(e) !== false) {
        e.preventDefault()
        if (e.key === ' ') tookSpace = true
      }
    }
    // Stops a focused button from also firing its own click when a Space shortcut comes back up.
    const onKeyUp = (e) => {
      if (e.key === ' ' && tookSpace) {
        tookSpace = false
        e.preventDefault()
      }
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
