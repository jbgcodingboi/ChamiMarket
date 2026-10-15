import { useState } from 'react'
import EquityChart from '../components/portfolio/EquityChart.jsx'
import PortfolioDashboard from '../components/portfolio/PortfolioDashboard.jsx'
import PositionManager from '../components/portfolio/PositionManager.jsx'
import TradeHistory from '../components/portfolio/TradeHistory.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { BriefcaseIcon, RefreshIcon } from '../components/ui/Icons.jsx'
import Tabs from '../components/ui/Tabs.jsx'
import { useDocumentTitle } from '../hooks/useDocumentTitle.js'
import { usePortfolioMetrics } from '../hooks/usePortfolio.js'
import { useAccountStore } from '../store/accountStore.js'
import { useUiStore } from '../store/uiStore.js'
import { formatCurrency } from '../utils/format.js'

export default function PortfolioPage() {
  useDocumentTitle('Portfolio')
  const user = useAccountStore((s) => s.user)
  const portfolio = useAccountStore((s) => s.portfolio)
  const metrics = usePortfolioMetrics()
  const openAuth = useUiStore((s) => s.openAuth)
  const setResetOpen = useUiStore((s) => s.setResetOpen)
  const [tab, setTab] = useState('positions')

  if (!user || !portfolio || !metrics) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          icon={BriefcaseIcon}
          title="Log in to view your portfolio"
          action={
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => openAuth('login', 'Log in to view your portfolio')}>
                Log in
              </button>
              <button type="button" className="btn btn-primary" onClick={() => openAuth('signup')}>
                Sign up free
              </button>
            </div>
          }
        >
          Track your play-money cash, open positions, PnL and trade history. New accounts start with $100,000.00.
        </EmptyState>
      </div>
    )
  }

  const positions = Object.values(portfolio.positions)

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
          <p className="mt-1 text-sm text-muted">
            {user.username} · Run {portfolio.run} started with {formatCurrency(portfolio.runStartCash)}
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setResetOpen(true)}>
          <RefreshIcon /> Reset balance
        </button>
      </div>
      <PortfolioDashboard metrics={metrics} resetsUsed={portfolio.resetsUsed} />
      <EquityChart netWorth={metrics.netWorth} />
      <div className="space-y-4">
        <Tabs
          tabs={[
            { id: 'positions', label: 'Positions', count: positions.length },
            { id: 'history', label: 'Trade History', count: portfolio.history.length },
          ]}
          value={tab}
          onChange={setTab}
          label="Portfolio sections"
        />
        <div role="tabpanel">
          {tab === 'positions' ? <PositionManager positions={positions} /> : <TradeHistory history={portfolio.history} />}
        </div>
      </div>
    </div>
  )
}
