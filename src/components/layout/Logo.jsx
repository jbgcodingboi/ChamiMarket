import { Link } from 'react-router-dom'

export default function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2 rounded-lg" aria-label="RedBook Markets home">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--color-primary-500)" />
        <path
          d="M9 7h8.5a5.5 5.5 0 0 1 1.9 10.66L23.5 25h-4.4l-3.6-6.8H13V25H9V7Zm4 3.6v4.2h4.3a2.1 2.1 0 0 0 0-4.2H13Z"
          fill="#fff"
        />
      </svg>
      <span className="hidden text-[17px] leading-none font-bold tracking-tight sm:inline">
        RedBook<span className="font-medium text-muted"> Markets</span>
      </span>
    </Link>
  )
}
