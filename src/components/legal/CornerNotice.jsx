import { Link, useLocation } from 'react-router-dom'
import { useLegalStore } from '../../store/legalStore.js'

const Icon = () => (
  <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-warn" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16.5v.01" />
  </svg>
)

/**
 * Always-on notice in the bottom left corner: an unofficial fan site with no
 * affiliation or endorsement. It can shrink to a small pill but never goes away,
 * and starts as the pill on phones.
 */
export default function CornerNotice() {
  const min = useLegalStore((s) => s.noticeMin)
  const setMin = useLegalStore((s) => s.setNoticeMin)
  const accepted = useLegalStore((s) => s.accepted)
  const { pathname } = useLocation()
  // The agreement pop-up says the same thing, so stay out of its way.
  if (!accepted && pathname !== '/terms') return null

  return (
    <aside aria-label="Site notice" className="fixed bottom-24 left-3 z-40 max-w-[calc(100vw-1.5rem)] sm:bottom-4 sm:left-4">
      {min ? (
        <button
          type="button"
          onClick={() => setMin(false)}
          aria-expanded="false"
          className="flex items-center gap-1.5 rounded-full border border-warn/40 bg-surface/95 px-3 py-1.5 text-xs font-medium text-fg shadow-lg shadow-black/40 backdrop-blur hover:border-warn/70"
        >
          <Icon /> Unofficial fan site
        </button>
      ) : (
        <div className="w-80 max-w-full rounded-xl border border-warn/40 bg-surface/95 p-3 text-xs shadow-xl shadow-black/50 backdrop-blur">
          <div className="flex items-start gap-2">
            <Icon />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-fg">Unofficial fan site</p>
              <p className="mt-1 leading-relaxed text-muted">
                Not affiliated with, endorsed by or associated with Chaminade High School, or any team, league, company or data source used on this site.
                Play money only.
              </p>
              <Link to="/terms" className="mt-1.5 inline-block font-medium text-primary-300 hover:underline">
                Terms and disclaimers
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setMin(true)}
              aria-expanded="true"
              className="-mt-0.5 -mr-0.5 rounded-md px-1.5 py-0.5 text-subtle hover:bg-surface-3 hover:text-fg"
              aria-label="Shrink notice"
            >
              Hide
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
