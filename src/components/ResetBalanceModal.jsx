import { useId, useRef, useState } from 'react'
import { RESET_CASH } from '../config.js'
import { useAccountStore } from '../store/accountStore.js'
import { toast } from '../store/toastStore.js'
import { useUiStore } from '../store/uiStore.js'
import { formatCurrency } from '../utils/format.js'
import { AlertIcon } from './ui/Icons.jsx'
import Modal from './ui/Modal.jsx'

function ResetForm({ onCancel, onDone }) {
  const resetBalance = useAccountStore((s) => s.resetBalance)
  const resetsUsed = useAccountStore((s) => s.portfolio?.resetsUsed ?? 0)
  const openCount = useAccountStore((s) => Object.keys(s.portfolio?.positions ?? {}).length)
  const [text, setText] = useState('')
  const done = useRef(false)
  const id = useId()
  const armed = text.trim().toUpperCase() === 'RESET'

  const confirm = async (e) => {
    e.preventDefault()
    if (!armed || done.current) return
    done.current = true
    try {
      await resetBalance()
      toast({ tone: 'success', title: 'Balance reset', description: `Your cash is now ${formatCurrency(RESET_CASH)}.` })
      onDone()
    } catch (err) {
      done.current = false
      toast({ tone: 'error', title: 'Reset failed', description: err.message })
    }
  }

  return (
    <form onSubmit={confirm} className="space-y-4">
      <div className="flex gap-3 rounded-xl border border-no/40 bg-no-soft p-3 text-sm">
        <AlertIcon className="mt-0.5 size-5 shrink-0 text-no" />
        <ul className="space-y-1.5">
          <li>
            Your balance will be reset to <strong className="tabular">{formatCurrency(RESET_CASH)}</strong>, not
            $100,000.
          </li>
          <li>
            All <strong>{openCount}</strong> open position{openCount === 1 ? '' : 's'} will be cleared without a
            payout, and Unrealized and Realized PnL start again at $0.00.
          </li>
          <li>
            <strong>This action cannot be undone.</strong> Trade history is kept with a reset marker.
          </li>
          <li>After a reset you can reset again in 5 minutes.</li>
        </ul>
      </div>
      <p className="text-sm text-muted">Resets used so far: {resetsUsed}</p>
      <div>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
          Type RESET to confirm
        </label>
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          className="input font-mono tracking-widest"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={!armed} className="btn btn-primary">
          Reset to {formatCurrency(RESET_CASH)}
        </button>
      </div>
    </form>
  )
}

export default function ResetBalanceModal() {
  const open = useUiStore((s) => s.resetOpen)
  const setOpen = useUiStore((s) => s.setResetOpen)
  const user = useAccountStore((s) => s.user)
  const close = () => setOpen(false)
  return (
    <Modal open={open && Boolean(user)} onClose={close} title="Reset your balance?" size="sm">
      <ResetForm key={open ? 'open' : 'closed'} onCancel={close} onDone={close} />
    </Modal>
  )
}
