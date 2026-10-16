import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePortfolioMetrics } from '../../hooks/usePortfolio.js'
import { useAccountStore } from '../../store/accountStore.js'
import { toast } from '../../store/toastStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { formatCurrency } from '../../utils/format.js'
import { BriefcaseIcon, ChevronDownIcon, InfoIcon, LogOutIcon, RefreshIcon, TrashIcon, TrophyIcon } from '../ui/Icons.jsx'
import { BACKEND_ENABLED } from '../../services/backend/config.js'
import { createRecoveryCode } from '../../services/backend/api.js'

export default function UserMenu() {
  const user = useAccountStore((s) => s.user)
  const logOut = useAccountStore((s) => s.logOut)
  const setResetOpen = useUiStore((s) => s.setResetOpen)
  const setDeleteOpen = useUiStore((s) => s.setDeleteOpen)
  const metrics = usePortfolioMetrics()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user || !metrics) return null

  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-3'
  const icon = 'size-4 shrink-0 text-muted'

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-xl border border-line py-1 pr-2 pl-1 transition hover:bg-surface-3"
      >
        <span className="grid size-7 place-items-center rounded-lg bg-primary-500 text-sm font-bold text-white uppercase">
          {user.username[0]}
        </span>
        <span className="hidden flex-col items-start leading-tight sm:flex">
          <span className="text-[11px] text-muted">Cash</span>
          <span className="text-sm font-semibold tabular">{formatCurrency(metrics.cash)}</span>
        </span>
        <ChevronDownIcon className="size-4 text-muted" />
        <span className="sr-only">Account menu for {user.username}</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-40 mt-2 w-64 animate-scale-in rounded-xl border border-line bg-surface-2 p-1.5 shadow-2xl shadow-black/60"
        >
          <div className="border-b border-line px-3 pt-2 pb-3">
            <p className="truncate font-semibold">{user.username}</p>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted">Net worth</dt>
                <dd className="font-semibold tabular">{formatCurrency(metrics.netWorth)}</dd>
              </div>
              <div>
                <dt className="text-muted">Cash</dt>
                <dd className="font-semibold tabular">{formatCurrency(metrics.cash)}</dd>
              </div>
            </dl>
          </div>
          <div className="pt-1.5">
            <Link role="menuitem" to="/portfolio" className={item} onClick={() => setOpen(false)}>
              <BriefcaseIcon className={icon} /> Portfolio
            </Link>
            <Link role="menuitem" to="/leaderboard" className={item} onClick={() => setOpen(false)}>
              <TrophyIcon className={icon} /> Leaderboard
            </Link>
            <button
              role="menuitem"
              type="button"
              className={item}
              onClick={() => {
                setOpen(false)
                setResetOpen(true)
              }}
            >
              <RefreshIcon className={icon} /> Reset balance
            </button>
            {BACKEND_ENABLED && (
              <button
                role="menuitem"
                type="button"
                className={item}
                onClick={async () => {
                  setOpen(false)
                  try {
                    useUiStore.getState().showRecovery(await createRecoveryCode(), 'new')
                  } catch (err) {
                    toast({ tone: 'error', title: 'Could not make a new code', description: err.message })
                  }
                }}
              >
                <InfoIcon className={icon} /> New recovery code
              </button>
            )}
            <button
              role="menuitem"
              type="button"
              className={`${item} text-no`}
              onClick={() => {
                setOpen(false)
                logOut()
                toast({ title: 'Logged out', description: BACKEND_ENABLED ? 'Your paper portfolio is saved to your account.' : 'Your paper portfolio is saved on this device.' })
              }}
            >
              <LogOutIcon className="size-4 shrink-0" /> Log out
            </button>
            <div className="mt-1.5 border-t border-line pt-1.5">
              <button
                role="menuitem"
                type="button"
                className={`${item} text-xs text-subtle hover:text-no`}
                onClick={() => {
                  setOpen(false)
                  setDeleteOpen(true)
                }}
              >
                <TrashIcon className="size-4 shrink-0" /> Delete account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
