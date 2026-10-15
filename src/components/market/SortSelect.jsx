import { SORTS } from '../../utils/filters.js'
import { ChevronDownIcon } from '../ui/Icons.jsx'

export default function SortSelect({ value, onChange }) {
  return (
    <div className="relative">
      <label htmlFor="market-sort" className="sr-only">
        Sort markets
      </label>
      <select
        id="market-sort"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input h-9 appearance-none py-1.5 pr-8 pl-3 text-sm"
      >
        {SORTS.map((s) => (
          <option key={s.id} value={s.id}>
            Sort: {s.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted" />
    </div>
  )
}
