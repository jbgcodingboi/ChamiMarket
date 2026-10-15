import { formatCents, formatSharesShort } from '../../utils/format.js'
import SimTag from './SimTag.jsx'
import { useFeedEntries } from './useFeedEntries.js'

function Item({ e }) {
  const yes = e.side === 'yes'
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 px-4 text-xs whitespace-nowrap">
      <span className="font-semibold">{e.user}</span>
      <span className={yes ? 'text-yes' : 'text-no'}>
        {e.action === 'buy' ? '▲ bought' : '▼ sold'} {e.sideLabel ?? (yes ? 'Yes' : 'No')}
      </span>
      <span className="tabular text-muted">
        {formatSharesShort(e.shares)} @ {formatCents(e.price)}
      </span>
      <span className="max-w-[14rem] truncate text-muted">{e.marketTitle}</span>
      {e.sim && <SimTag />}
    </span>
  )
}

/** Mobile replacement for the activity sidebar: a slow scrolling ticker. */
export default function TradeTicker() {
  const entries = useFeedEntries(12)
  if (!entries.length) return null
  return (
    <section className="card overflow-hidden py-2" aria-label="Recent trades">
      <div className="group flex w-max animate-ticker hover:[animation-play-state:paused]">
        <div className="flex">
          {entries.map((e) => (
            <Item key={e.id} e={e} />
          ))}
        </div>
        <div className="flex" aria-hidden="true">
          {entries.map((e) => (
            <Item key={`dup-${e.id}`} e={e} />
          ))}
        </div>
      </div>
    </section>
  )
}
