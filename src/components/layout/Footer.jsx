import PaperBadge from './PaperBadge.jsx'

const YEAR = new Date().getFullYear()

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-line pb-24 lg:pb-0">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-muted md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl space-y-2">
          <PaperBadge />
          <p>
            Chami Market is a paper trading simulator. Every balance, trade and payout uses play money with
            no cash value. There is nothing to fund and nothing to cash out.
          </p>
          <p className="text-xs text-subtle">
            Odds come from public prediction market data when reachable, with bundled demo data as a fallback.
            Chami Market is an independent demo and is not affiliated with, endorsed by or connected to any
            real prediction market or exchange. Nothing here is financial advice.
          </p>
        </div>
        <p className="shrink-0 text-xs text-subtle">© {YEAR} Chami Market demo</p>
      </div>
    </footer>
  )
}
