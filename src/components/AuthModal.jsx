import { useId, useRef, useState } from 'react'
import { useAccountStore } from '../store/accountStore.js'
import { toast } from '../store/toastStore.js'
import { useUiStore } from '../store/uiStore.js'
import { formatSignedCurrency } from '../utils/format.js'
import { EyeIcon, EyeOffIcon, InfoIcon } from './ui/Icons.jsx'
import Modal from './ui/Modal.jsx'
import Tabs from './ui/Tabs.jsx'

function PasswordField({ id, label, value, onChange, error, autoComplete }) {
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : undefined}
          className="input pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted hover:text-fg"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {error && (
        <p id={`${id}-err`} className="mt-1.5 text-sm text-no">
          {error}
        </p>
      )}
    </div>
  )
}

function AuthForm({ mode, onModeChange, message, onSuccess }) {
  const signUp = useAccountStore((s) => s.signUp)
  const logIn = useAccountStore((s) => s.logIn)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const ids = useId()
  const signup = mode === 'signup'

  const submit = async (e) => {
    e.preventDefault()
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setErrors({})
    try {
      if (signup) {
        const user = await signUp({ identifier, password, confirm })
        toast({ tone: 'success', title: `Welcome, ${user.username}`, description: 'You have $100,000.00 in play money to trade.' })
      } else {
        const { user, settled } = await logIn({ identifier, password })
        toast({ tone: 'success', title: `Welcome back, ${user.username}` })
        for (const s of settled) {
          toast({
            tone: 'info',
            title: 'Market settled while you were away',
            description: `Resolved ${s.outcome === 'yes' ? 'Yes' : 'No'} · Realized ${formatSignedCurrency(s.realizedPnl)}`,
          })
        }
      }
      onSuccess()
    } catch (err) {
      setErrors({ [err.field ?? 'form']: err.message })
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Tabs
        tabs={[
          { id: 'login', label: 'Log in' },
          { id: 'signup', label: 'Sign up' },
        ]}
        value={mode}
        onChange={(m) => {
          setErrors({})
          onModeChange(m)
        }}
        label="Account"
      />
      {message && (
        <p className="flex items-center gap-2 rounded-lg bg-primary-500/15 px-3 py-2 text-sm text-primary-200">
          <InfoIcon className="size-4 shrink-0" />
          {message}
        </p>
      )}
      <div>
        <label htmlFor={`${ids}-id`} className="mb-1.5 block text-sm font-medium">
          Username or email
        </label>
        <input
          id={`${ids}-id`}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck="false"
          aria-invalid={Boolean(errors.identifier)}
          aria-describedby={errors.identifier ? `${ids}-id-err` : signup ? `${ids}-id-hint` : undefined}
          className="input"
        />
        {errors.identifier ? (
          <p id={`${ids}-id-err`} className="mt-1.5 text-sm text-no">
            {errors.identifier}
          </p>
        ) : (
          signup && (
            <p id={`${ids}-id-hint`} className="mt-1.5 text-xs text-subtle">
              3 to 20 letters, numbers or underscores, or an email address.
            </p>
          )
        )}
      </div>
      <PasswordField
        id={`${ids}-pw`}
        label="Password"
        value={password}
        onChange={setPassword}
        error={errors.password}
        autoComplete={signup ? 'new-password' : 'current-password'}
      />
      {signup && (
        <PasswordField
          id={`${ids}-confirm`}
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          error={errors.confirm}
          autoComplete="new-password"
        />
      )}
      {errors.form && (
        <p className="text-sm text-no" role="alert">
          {errors.form}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn btn-primary w-full py-2.5">
        {busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
      </button>
      <p className="text-xs leading-relaxed text-subtle">
        Accounts live only in this browser. Passwords are salted and hashed before saving, but this demo login
        is not meant to protect anything of value. New accounts get $100,000.00 in play money.
      </p>
    </form>
  )
}

export default function AuthModal() {
  const auth = useUiStore((s) => s.auth)
  const openAuth = useUiStore((s) => s.openAuth)
  const close = useUiStore((s) => s.closeAuth)
  return (
    <Modal open={auth.open} onClose={close} title={auth.mode === 'signup' ? 'Create your paper account' : 'Log in to Chami Market'} size="sm">
      <AuthForm
        key={auth.open ? 'open' : 'closed'}
        mode={auth.mode}
        onModeChange={(m) => openAuth(m, auth.message)}
        message={auth.message}
        onSuccess={close}
      />
    </Modal>
  )
}
