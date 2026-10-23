import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useLegalStore } from '../../store/legalStore.js'

const SHOW_MS = 5000

const Icon = () => (
  <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-warn" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16.5v.01" />
  </svg>
)

/**
 * Notice in the bottom left corner: an unofficial fan site with no
 * affiliation or endorsement. It shows in full for about five seconds on
 * each visit (or until the visitor clicks or types elsewhere, so it never
 * sits over a game being played), then shrinks to a pill that opens it again.
 */
export default function CornerNotice() {
  const accepted = useLegalStore((s) => s.accepted)
  const { pathname } = useLocation()
  const [open, setOpen] = useState(true)
  // Once the visitor opens or hides it themselves, it stops timing out.
  const [touched, setTouched] = useState(false)
  const box = useRef(null)
  // The agreement pop-up says the same thing, so stay out of its way.
  const visible = accepted || pathname === '/terms'

  useEffect(() => {
    if (!visible || touched) return undefined
    const shrink = () => setOpen(false)
    const t = setTimeout(shrink, SHOW_MS)
    const elsewhere = (e) => {
      if (!box.current?.contains(e.target)) shrink()
    }
    window.addEventListener('pointerdown', elsewhere)
    window.addEventListener('keydown', elsewhere)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointerdown', elsewhere)
      window.removeEventListener('keydown', elsewhere)
    }
  }, [visible, touched])

  if (!visible) return null
  const toggle = (next) => {
    setTouched(true)
    setOpen(next)
  }

  return (
    <aside ref={box} aria-label="Site notice" className="fixed bottom-24 left-3 z-40 max-w-[calc(100vw-1.5rem)] sm:bottom-4 sm:left-4">
      {open ? (
        <div className="w-72 max-w-full animate-fade-in rounded-xl sm:w-80 border border-warn/40 bg-surface/95 p-3 text-xs shadow-xl shadow-black/50 backdrop-blur">
          <div className="flex items-start gap-2">
            <Icon />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-fg">Unofficial fan site</p>
              {/* Phones get the short version, so the notice covers less of the screen. */}
              <p className="mt-1 leading-relaxed text-muted sm:hidden">
                Not linked to Chaminade High School or anyone else. Play money only. Play at your own risk, since schools don’t allow games of chance.
              </p>
              <p className="mt-1 hidden leading-relaxed text-muted sm:block">
                Not affiliated with, endorsed by or associated with Chaminade High School, or any team, league, company or data source used on this site.
                Play money only. Play at your own risk, since schools like Chaminade don’t allow gambling or games of chance.
              </p>
              <Link to="/terms" className="mt-1.5 inline-block font-medium text-primary-300 hover:underline">
                Terms and disclaimers
              </Link>
            </div>
            <button
              type="button"
              onClick={() => toggle(false)}
              aria-expanded="true"
              className="-mt-0.5 -mr-0.5 rounded-md px-1.5 py-0.5 text-subtle hover:bg-surface-3 hover:text-fg"
              aria-label="Shrink notice"
            >
              Hide
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => toggle(true)}
          aria-expanded="false"
          className="flex animate-fade-in items-center gap-1.5 rounded-full border border-warn/40 bg-surface/95 px-3 py-1.5 text-xs font-medium text-fg shadow-lg shadow-black/40 backdrop-blur hover:border-warn/70"
        >
          <Icon /> Unofficial fan site
        </button>
      )}
    </aside>
  )
}
