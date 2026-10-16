import { useState } from 'react'
import { toast } from '../store/toastStore.js'
import { useUiStore } from '../store/uiStore.js'
import { AlertIcon } from './ui/Icons.jsx'
import Modal from './ui/Modal.jsx'

const REASONS = {
  signup: 'Your account is ready. There is no email or reset link, so this code is the only way back in if you forget your password.',
  reset: 'Your password is changed and your old code no longer works. Here is your new one.',
  new: 'Your old code no longer works. Keep this new one somewhere safe.',
}

/** Shows a just-issued recovery code once (backend mode). */
export default function RecoveryCodeModal() {
  const recovery = useUiStore((s) => s.recovery)
  const showRecovery = useUiStore((s) => s.showRecovery)
  const [copied, setCopied] = useState(false)
  const close = () => {
    setCopied(false)
    showRecovery(null)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recovery.code)
      setCopied(true)
    } catch {
      toast({ tone: 'info', title: 'Copy it by hand', description: 'Your browser blocked the clipboard.' })
    }
  }
  return (
    <Modal open={Boolean(recovery)} onClose={close} title="Save your recovery code" size="sm">
      {recovery && (
        <div className="space-y-4">
          <p className="text-sm text-muted">{REASONS[recovery.reason] ?? REASONS.new}</p>
          <p className="rounded-xl border border-line-strong bg-surface-2 py-4 text-center font-mono text-2xl font-bold tracking-widest select-all" aria-label="Recovery code">
            {recovery.code}
          </p>
          <div className="flex gap-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
            <AlertIcon className="mt-0.5 size-5 shrink-0 text-warn" />
            <p>It is shown only this once. Write it down or save it in a password manager.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost flex-1" onClick={copy}>
              {copied ? 'Copied' : 'Copy code'}
            </button>
            <button type="button" className="btn btn-primary flex-1" onClick={close}>
              I saved it
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
