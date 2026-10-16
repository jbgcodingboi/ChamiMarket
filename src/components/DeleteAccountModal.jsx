import { useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccountStore } from '../store/accountStore.js'
import { toast } from '../store/toastStore.js'
import { useUiStore } from '../store/uiStore.js'
import { AlertIcon } from './ui/Icons.jsx'
import Modal from './ui/Modal.jsx'

function DeleteForm({ onCancel, onDone }) {
  const user = useAccountStore((s) => s.user)
  const deleteAccount = useAccountStore((s) => s.deleteAccount)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const done = useRef(false)
  const id = useId()
  const armed = text.trim().toUpperCase() === 'DELETE'

  const confirm = async (e) => {
    e.preventDefault()
    if (!armed || done.current) return
    done.current = true
    setBusy(true)
    setError('')
    try {
      await deleteAccount({ confirm: text })
      toast({ title: 'Account deleted', description: 'Your account and everything tied to it are gone.' })
      onDone()
    } catch (err) {
      done.current = false
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={confirm} className="space-y-4">
      <div className="flex gap-3 rounded-xl border border-no/50 bg-no-soft p-3 text-sm">
        <AlertIcon className="mt-0.5 size-5 shrink-0 text-no" />
        <div className="space-y-1.5">
          <p className="font-semibold text-fg">This permanently deletes {user.username}.</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>Your balance, open positions, trade history and game history are erased.</li>
            <li>You are removed from every leaderboard and your feed entries disappear.</li>
            <li>
              <strong>There is no undo.</strong> Nobody can bring the account back, and the username becomes free for anyone to take.
            </li>
          </ul>
        </div>
      </div>
      <div>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
          Type DELETE to confirm
        </label>
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck="false"
          className="input font-mono tracking-widest"
          aria-invalid={error ? 'true' : undefined}
        />
      </div>
      {error && (
        <p className="text-sm text-no" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Keep my account
        </button>
        <button type="submit" disabled={!armed || busy} className="btn bg-no-strong font-semibold text-white hover:bg-no disabled:opacity-50">
          {busy ? 'Deleting…' : 'Delete forever'}
        </button>
      </div>
    </form>
  )
}

/** Stern confirmation for deleting the signed-in account: type DELETE, like resetting the balance. */
export default function DeleteAccountModal() {
  const open = useUiStore((s) => s.deleteOpen)
  const setOpen = useUiStore((s) => s.setDeleteOpen)
  const user = useAccountStore((s) => s.user)
  const navigate = useNavigate()
  const close = () => setOpen(false)
  return (
    <Modal open={open && Boolean(user)} onClose={close} title="Delete your account?" size="sm">
      {user && (
        <DeleteForm
          key={open ? 'open' : 'closed'}
          onCancel={close}
          onDone={() => {
            close()
            navigate('/')
          }}
        />
      )}
    </Modal>
  )
}
