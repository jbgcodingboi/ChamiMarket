import { useToastStore } from '../../store/toastStore.js'
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './Icons.jsx'

const TONES = {
  success: { icon: CheckIcon, cls: 'text-yes' },
  error: { icon: AlertIcon, cls: 'text-no' },
  info: { icon: InfoIcon, cls: 'text-primary-300' },
}

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const { icon: Icon, cls } = TONES[t.tone] ?? TONES.info
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5 shadow-xl shadow-black/50"
          >
            <Icon className={`mt-0.5 size-5 shrink-0 ${cls}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.description && <p className="mt-0.5 text-sm text-muted">{t.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="rounded-md p-1 text-subtle hover:bg-surface-3 hover:text-fg"
              aria-label="Dismiss notification"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
