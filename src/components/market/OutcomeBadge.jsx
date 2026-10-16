import { CheckIcon } from '../ui/Icons.jsx'

/** "Resolved: Yes" style badge. Uses a check icon and text, not color alone. */
export default function OutcomeBadge({ outcome, labels }) {
  if (outcome === 'void') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-muted">
        <CheckIcon className="size-3.5" />
        Voided: refunded at cost
      </span>
    )
  }
  const yes = outcome === 'yes'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        yes ? 'bg-yes-soft text-yes' : 'bg-no-soft text-no'
      }`}
    >
      <CheckIcon className="size-3.5" />
      Resolved: {labels?.[outcome] ?? (yes ? 'Yes' : 'No')}
    </span>
  )
}
