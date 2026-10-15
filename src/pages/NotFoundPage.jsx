import { Link } from 'react-router-dom'
import EmptyState from '../components/ui/EmptyState.jsx'
import { SearchIcon } from '../components/ui/Icons.jsx'
import { useDocumentTitle } from '../hooks/useDocumentTitle.js'

export default function NotFoundPage() {
  useDocumentTitle('Page not found')
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <EmptyState
        icon={SearchIcon}
        title="404: page not found"
        action={
          <Link to="/" className="btn btn-primary">
            Back to markets
          </Link>
        }
      >
        That page doesn't exist. Check the link or head back to the markets.
      </EmptyState>
    </div>
  )
}
