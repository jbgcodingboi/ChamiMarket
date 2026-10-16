import { Link } from 'react-router-dom'
import BrandMark from './BrandMark.jsx'

export default function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2 rounded-lg" aria-label="Chami Market home">
      <BrandMark />
      <span className="hidden text-[17px] leading-none font-bold tracking-tight sm:inline">
        Chami<span className="font-medium text-muted"> Market</span>
      </span>
    </Link>
  )
}
