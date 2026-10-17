import { useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { createRecoveryCode, resetPassword } from '../services/backend/api.js'
import { BACKEND_ENABLED } from '../services/backend/config.js'
import { useAccountStore } from '../store/accountStore.js'
import { isEmail, validatePassword } from '../utils/validation.js'
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

/** Backend mode: sets a new password with a recovery code, then logs in. */
function RecoverForm({ onBack, onSuccess }) {
  const logIn = useAccountStore((s) => s.logIn)
  const [identifier, setIdentifier] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const ids = useId()

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    const pwError = validatePassword(password) ?? (password.length > 72 ? 'Password must be 72 characters or fewer.' : null)
    const next = {
      ...(!identifier.trim() && { identifier: 'Enter your username or email.' }),
      ...(code.replace(/[^A-Za-z0-9]/g, '').length !== 12 && { code: 'Recovery codes have 12 letters and numbers.' }),
      ...(pwError && { password: pwError }),
      ...(password !== confirm && !pwError && { confirm: 'Passwords do not match.' }),
    }
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      const fresh = await resetPassword({ identifier, code, password })
      // The old code no longer works, so show the new one before anything else can fail.
      useUiStore.getState().showRecovery(fresh, 'reset')
      await logIn({ identifier, password })
      toast({ tone: 'success', title: 'Password changed', description: 'You are logged in with your new password.' })
      onSuccess()
    } catch (err) {
      setErrors({ [err.field === 'password' ? 'password' : 'form']: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-muted">Enter the recovery code you saved when you signed up, then pick a new password.</p>
      <div>
        <label htmlFor={`${ids}-id`} className="mb-1.5 block text-sm font-medium">
          Username or email
        </label>
        <input id={`${ids}-id`} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck="false" aria-invalid={Boolean(errors.identifier)} className="input" />
        {errors.identifier && <p className="mt-1.5 text-sm text-no">{errors.identifier}</p>}
      </div>
      <div>
        <label htmlFor={`${ids}-code`} className="mb-1.5 block text-sm font-medium">
          Recovery code
        </label>
        <input
          id={`${ids}-code`}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck="false"
          aria-invalid={Boolean(errors.code)}
          className="input font-mono tracking-widest"
        />
        {errors.code && <p className="mt-1.5 text-sm text-no">{errors.code}</p>}
      </div>
      <PasswordField id={`${ids}-pw`} label="New password" value={password} onChange={setPassword} error={errors.password} autoComplete="new-password" />
      <PasswordField id={`${ids}-confirm`} label="Confirm new password" value={confirm} onChange={setConfirm} error={errors.confirm} autoComplete="new-password" />
      {errors.form && (
        <p className="text-sm text-no" role="alert">
          {errors.form}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn btn-primary w-full py-2.5">
        {busy ? 'Please wait…' : 'Set new password'}
      </button>
      <button type="button" onClick={onBack} className="w-full text-center text-sm text-muted hover:text-fg">
        Back to log in
      </button>
    </form>
  )
}

function AuthForm({ mode, onModeChange, message, onSuccess }) {
  const signUp = useAccountStore((s) => s.signUp)
  const logIn = useAccountStore((s) => s.logIn)
  const [identifier, setIdentifier] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const ids = useId()
  const signup = mode === 'signup'
  const guest = useAccountStore((s) => Boolean(s.user?.guest))
  // Signing up with an email also needs a username to show everyone; a username sign-up needs no email.
  const pickName = signup && isEmail(identifier.trim())

  const submit = async (e) => {
    e.preventDefault()
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setErrors({})
    try {
      if (signup) {
        const user = await signUp({ identifier, password, confirm, username: pickName ? username : undefined })
        toast({
          tone: 'success',
          title: `Welcome, ${user.username}`,
          description: guest ? 'Your guest balance, trades and games are saved to your new account.' : 'You have $100,000.00 in play money to trade.',
        })
        if (BACKEND_ENABLED) {
          const code = await createRecoveryCode().catch(() => null)
          if (code) useUiStore.getState().showRecovery(code, 'signup')
          else toast({ tone: 'error', title: "Couldn't make your recovery code", description: 'Open the account menu and choose New recovery code.' })
        }
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
      {guest && (
        <p className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted" role="note">
          <InfoIcon className="size-4 shrink-0" />
          {signup
            ? 'Your guest balance, trades and games come with you.'
            : "Logging in switches to that account. This guest's progress stays behind, so sign up instead to keep it."}
        </p>
      )}
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
      {pickName && (
        <div>
          <label htmlFor={`${ids}-name`} className="mb-1.5 block text-sm font-medium">
            Username
          </label>
          <input
            id={`${ids}-name`}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="nickname"
            autoCapitalize="none"
            spellCheck="false"
            maxLength={20}
            aria-invalid={Boolean(errors.username)}
            aria-describedby={errors.username ? `${ids}-name-err` : `${ids}-name-hint`}
            className="input"
          />
          {errors.username ? (
            <p id={`${ids}-name-err`} className="mt-1.5 text-sm text-no">
              {errors.username}
            </p>
          ) : (
            <p id={`${ids}-name-hint`} className="mt-1.5 text-xs text-subtle">
              Shown on the leaderboard: 3 to 20 letters, numbers or underscores. You still log in with your email.
            </p>
          )}
        </div>
      )}
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
      {signup && (
        <p className="text-center text-xs text-subtle">
          By creating an account you agree to the{' '}
          <Link to="/terms" onClick={() => useUiStore.getState().closeAuth()} className="text-primary-300 underline">
            Terms of Use
          </Link>
          .
        </p>
      )}
      {BACKEND_ENABLED && !signup && (
        <button type="button" onClick={() => onModeChange('recover')} className="w-full text-center text-sm text-primary-300 hover:underline">
          Forgot your password?
        </button>
      )}
      <p className="text-xs leading-relaxed text-subtle">
        {BACKEND_ENABLED
          ? 'Your account works on any device. No email or confirmation link is needed; you get a recovery code at sign-up in case you forget your password. New accounts get $100,000.00 in play money.'
          : 'Accounts live only in this browser. Passwords are salted and hashed before saving, but this demo login is not meant to protect anything of value. New accounts get $100,000.00 in play money.'}
      </p>
    </form>
  )
}

export default function AuthModal() {
  const auth = useUiStore((s) => s.auth)
  const openAuth = useUiStore((s) => s.openAuth)
  const close = useUiStore((s) => s.closeAuth)
  return (
    <Modal
      open={auth.open}
      onClose={close}
      title={auth.mode === 'signup' ? 'Create your paper account' : auth.mode === 'recover' ? 'Reset your password' : 'Log in to Chami Market'}
      size="sm"
    >
      {auth.mode === 'recover' ? (
        <RecoverForm key={auth.open ? 'open' : 'closed'} onBack={() => openAuth('login')} onSuccess={close} />
      ) : (
        <AuthForm
          key={auth.open ? 'open' : 'closed'}
          mode={auth.mode}
          onModeChange={(m) => openAuth(m, auth.message)}
          message={auth.message}
          onSuccess={close}
        />
      )}
    </Modal>
  )
}
