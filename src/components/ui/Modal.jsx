import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './Icons.jsx'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const stack = []

/**
 * Accessible dialog: focus moves inside on open and is trapped there, Escape
 * and backdrop clicks close it, focus returns to the trigger on close, and the
 * page behind stops scrolling. variant="sheet" renders a mobile bottom sheet.
 * dismissible={false} hides the close button and ignores Escape and backdrop
 * clicks, for dialogs that need an answer.
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  variant = 'dialog',
  initialFocusRef,
  dismissible = true,
}) {
  const [prevOpen, setPrevOpen] = useState(open)
  const [closing, setClosing] = useState(false)
  if (prevOpen !== open) {
    setPrevOpen(open)
    setClosing(!open)
  }
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  const descId = useId()

  const dismissibleRef = useRef(dismissible)
  useEffect(() => {
    onCloseRef.current = onClose
    dismissibleRef.current = dismissible
  })

  useEffect(() => {
    if (!closing) return undefined
    const t = setTimeout(() => setClosing(false), 150)
    return () => clearTimeout(t)
  }, [closing])

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const token = {}
    stack.push(token)
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => {
      const target = initialFocusRef?.current ?? panelRef.current?.querySelector(FOCUSABLE) ?? panelRef.current
      target?.focus()
    })
    const onKey = (e) => {
      if (stack[stack.length - 1] !== token) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (dismissibleRef.current) onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const nodes = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null)
      if (!nodes.length) {
        e.preventDefault()
        return
      }
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const inside = panelRef.current.contains(document.activeElement)
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(token), 1)
      if (!stack.length) document.body.style.overflow = ''
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus()
    }
  }, [open, initialFocusRef])

  if (!open && !closing) return null

  const sheet = variant === 'sheet'
  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg' }

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex ${sheet ? 'items-end' : 'items-end sm:items-center'} justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-150 ${closing ? 'opacity-0' : 'animate-fade-in'}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissible) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`relative max-h-[92vh] w-full overflow-y-auto border border-line bg-surface shadow-2xl shadow-black/60 outline-none scrollbar-thin ${
          sheet
            ? 'rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))] animate-sheet-up'
            : `rounded-t-2xl sm:rounded-2xl ${widths[size]} animate-scale-in`
        }`}
      >
        {sheet && <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />}
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 rounded-lg p-1.5 text-muted transition hover:bg-surface-3 hover:text-fg"
              aria-label="Close dialog"
            >
              <CloseIcon className="size-5" />
            </button>
          )}
        </div>
        <div className="px-5 pt-4 pb-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
