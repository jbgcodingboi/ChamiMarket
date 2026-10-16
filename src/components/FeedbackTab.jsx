import { useId, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { submitFeedback } from '../services/backend/api.js'
import { BACKEND_ENABLED } from '../services/backend/config.js'
import { useLegalStore } from '../store/legalStore.js'
import { toast } from '../store/toastStore.js'
import Modal from './ui/Modal.jsx'

const TYPES = [
  { id: 'suggestion', label: 'Suggestion' },
  { id: 'bug', label: 'Something broke' },
  { id: 'other', label: 'Other' },
]
const MAX = 1000

function FeedbackForm({ page, onDone }) {
  const [category, setCategory] = useState('suggestion')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const id = useId()
  const ready = message.trim().length >= 3

  const send = async (e) => {
    e.preventDefault()
    if (!ready || sending.current) return
    sending.current = true
    setBusy(true)
    setError('')
    try {
      await submitFeedback({ category, message: message.trim(), page })
      toast({ tone: 'success', title: 'Thanks for the feedback', description: 'It goes straight to the site owner.' })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <form onSubmit={send} className="space-y-4">
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">What kind?</legend>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <label
              key={t.id}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-300 ${
                category === t.id ? 'border-primary-400 bg-primary-500/20 text-fg' : 'border-line text-muted hover:text-fg'
              }`}
            >
              <input type="radio" name={`${id}-type`} value={t.id} checked={category === t.id} onChange={() => setCategory(t.id)} className="sr-only" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${id}-msg`} className="mb-1.5 block text-sm font-medium">
          Your message
        </label>
        <textarea
          id={`${id}-msg`}
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
          rows={5}
          maxLength={MAX}
          placeholder="An idea, a bug, a market you'd like to see…"
          className="input min-h-28 resize-y py-2 leading-relaxed"
          aria-describedby={`${id}-hint`}
          aria-invalid={error ? 'true' : undefined}
        />
        <p id={`${id}-hint`} className="mt-1.5 flex justify-between gap-3 text-xs text-subtle">
          <span>Please don&apos;t include personal information.</span>
          <span className="tabular">
            {message.length}/{MAX}
          </span>
        </p>
      </div>
      {error && (
        <p className="text-sm text-no" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={!ready || busy} className="btn btn-primary w-full py-2.5">
        {busy ? 'Sending…' : 'Send feedback'}
      </button>
    </form>
  )
}

/**
 * A slim tab on the right edge that opens a short feedback form. Messages go
 * to a private table only the site owner can read. Backend mode only, since
 * local mode has nowhere to send them.
 */
export default function FeedbackTab() {
  const [open, setOpen] = useState(false)
  const accepted = useLegalStore((s) => s.accepted)
  const { pathname } = useLocation()
  if (!BACKEND_ENABLED) return null
  return (
    <>
      {/* Hidden behind the first-visit pop-up, like the corner notice. */}
      {(accepted || pathname === '/terms') && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="fixed top-1/2 right-0 z-30 origin-bottom-right -translate-y-1/2 -rotate-90 rounded-t-lg border border-b-0 border-primary-400 bg-surface-2/90 px-3 py-1 text-[11px] font-semibold tracking-wide text-primary-300 shadow-lg shadow-black/40 backdrop-blur transition hover:border-primary-300 hover:text-primary-200"
        >
          Feedback
        </button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Feedback and suggestions" description="Tell us what to add, fix or change." size="sm">
        <FeedbackForm key={open ? 'open' : 'closed'} page={pathname} onDone={() => setOpen(false)} />
      </Modal>
    </>
  )
}
