import { Link } from 'react-router-dom'
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
            Chami Market is an unofficial fan site. It is not affiliated with, endorsed by or associated with
            Chaminade High School, or with any prediction market, exchange, team, league, company or data source
            used here. Odds come from public data when reachable, with bundled demo data as a fallback. Nothing
            here is financial advice.
          </p>
        </div>
        <div className="shrink-0 space-y-1 text-xs text-subtle md:text-right">
          <p>
            <Link to="/terms" className="text-muted hover:text-fg hover:underline">
              Terms of Use
            </Link>
          </p>
          <p>© {YEAR} Chami Market, an unofficial fan site</p>
        </div>
      </div>
    </footer>
  )
}
