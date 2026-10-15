import { useRef, useState } from 'react'
import { useAccountStore } from '../../store/accountStore.js'
import { useResolution, useResolutionStore } from '../../store/resolutionStore.js'
import { toast } from '../../store/toastStore.js'
import { formatCurrency, formatSignedCurrency } from '../../utils/format.js'
import { GavelIcon } from '../ui/Icons.jsx'
import Modal from '../ui/Modal.jsx'
import OutcomeBadge from './OutcomeBadge.jsx'

/**
 * Testing control: resolves a market locally. Winning shares pay $1.00,
 * losing shares $0.00; the active account settles now and other local
 * accounts settle on their next login.
 */
export default function ResolveMarket({ market }) {
  const resolution = useResolution(market.id)
  const resolve = useResolutionStore((s) => s.resolve)
  const applyPending = useAccountStore((s) => s.applyPendingResolutions)
  const [open, setOpen] = useState(false)
  const [outcome, setOutcome] = useState('yes')
  const busy = useRef(false)

  const confirm = () => {
    if (busy.current) return
    busy.current = true
    const recorded = resolve(market.id, outcome, { source: 'test', title: market.title })
    const settled = recorded ? applyPending().find((s) => s.marketId === market.id) : null
    setOpen(false)
    busy.current = false
    if (!recorded) {
      toast({ tone: 'info', title: 'Already resolved', description: 'This market already has a result.' })
      return
    }
    toast({
      tone: 'success',
      title: `Resolved: ${market.labels[outcome]}`,
      description: settled
        ? `Payout ${formatCurrency(settled.payout)} · Realized ${formatSignedCurrency(settled.realizedPnl)}`
        : 'You held no position in this market, so nothing was paid out.',
    })
  }

  return (
    <section className="rounded-xl border border-dashed border-line-strong p-4" aria-labelledby="resolve-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="resolve-heading" className="text-sm font-semibold">
            Testing tools
          </h2>
          <p className="mt-0.5 text-xs text-muted">Settle this market locally to try out payouts.</p>
        </div>
        {resolution ? (
          <OutcomeBadge outcome={resolution.outcome} labels={market.labels} />
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
            <GavelIcon /> Resolve market (test)
          </button>
        )}
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Resolve market (test)"
        description="Pick the winning outcome. This is a local testing control for the paper trading demo."
      >
        <fieldset>
          <legend className="sr-only">Winning outcome</legend>
          <div className="grid grid-cols-2 gap-2">
            {['yes', 'no'].map((s) => (
              <label
                key={s}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 p-3 text-sm font-semibold transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary-300 ${
                  outcome === s ? (s === 'yes' ? 'border-yes bg-yes-soft' : 'border-no bg-no-soft') : 'border-line'
                }`}
              >
                <input
                  type="radio"
                  name="outcome"
                  value={s}
                  checked={outcome === s}
                  onChange={() => setOutcome(s)}
                  className="accent-primary-500"
                />
                {market.labels[s]} wins
              </label>
            ))}
          </div>
        </fieldset>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Each winning share pays $1.00 and each losing share pays $0.00.</li>
          <li>Your positions in this market are closed and cash is credited now.</li>
          <li>Trading on this market is disabled for every local account.</li>
          <li>This cannot be undone.</li>
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={confirm}>
            Resolve as {market.labels[outcome]}
          </button>
        </div>
      </Modal>
    </section>
  )
}
