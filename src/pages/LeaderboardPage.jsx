import Leaderboard from '../components/social/Leaderboard.jsx'
import { useDocumentTitle } from '../hooks/useDocumentTitle.js'

export default function LeaderboardPage() {
  useDocumentTitle('Leaderboard')
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted">Overall, market trading and game standings. Play money only.</p>
      </div>
      <Leaderboard />
    </div>
  )
}
