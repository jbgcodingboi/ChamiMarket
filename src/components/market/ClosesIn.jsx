import { useClock } from '../../store/clockStore.js'
import { closesInText } from '../../utils/format.js'
import { ClockIcon } from '../ui/Icons.jsx'

export const DAY_MS = 864e5

/** "Closes in 2h 05m" for markets closing within 24 hours; nothing otherwise. */
export default function ClosesIn({ endDate, className = '' }) {
  const now = useClock((s) => s.now)
  const left = Date.parse(endDate) - now
  if (!(left > 0 && left <= DAY_MS)) return null
  return (
    <span className={`inline-flex items-center gap-1 font-medium whitespace-nowrap text-warn tabular ${className}`}>
      <ClockIcon className="size-3.5" />
      {closesInText(left)}
    </span>
  )
}
