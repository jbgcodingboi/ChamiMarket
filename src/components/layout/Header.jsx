import { NavLink } from 'react-router-dom'
import { useAccountStore } from '../../store/accountStore.js'
import { useUiStore } from '../../store/uiStore.js'
import SearchBar from '../market/SearchBar.jsx'
import { BriefcaseIcon, DiceIcon, GridIcon, TrophyIcon } from '../ui/Icons.jsx'
import DataSourceIndicator from './DataSourceIndicator.jsx'
import Logo from './Logo.jsx'
import PaperBadge from './PaperBadge.jsx'
import UserMenu from './UserMenu.jsx'

const NAV = [
  { to: '/', label: 'Markets', icon: GridIcon, end: true },
  { to: '/games', label: 'Games', icon: DiceIcon },
  { to: '/leaderboard', label: 'Leaderboard', icon: TrophyIcon },
  { to: '/portfolio', label: 'Portfolio', icon: BriefcaseIcon },
]

const navClass = ({ isActive }) =>
  `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
    isActive ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg'
  }`

export default function Header() {
  const user = useAccountStore((s) => s.user)
  const openAuth = useUiStore((s) => s.openAuth)

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <Logo />
        <div className="hidden max-w-md flex-1 md:block">
          <SearchBar navigateOnType />
        </div>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={navClass}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden lg:block">
            <DataSourceIndicator />
          </div>
          <span className="hidden xl:inline-flex">
            <PaperBadge />
          </span>
          <span className="xl:hidden">
            <PaperBadge compact />
          </span>
          {user?.guest ? (
            // Guests: their balance menu (with Log in inside it) and a way to keep their progress.
            <>
              <UserMenu />
              <button type="button" className="btn btn-primary px-3 whitespace-nowrap" onClick={() => openAuth('signup')}>
                Sign up
              </button>
            </>
          ) : user ? (
            <UserMenu />
          ) : (
            <>
              <button type="button" className="btn btn-ghost px-3" onClick={() => openAuth('login')}>
                Log in
              </button>
              <button type="button" className="btn btn-primary hidden px-3 sm:inline-flex" onClick={() => openAuth('signup')}>
                Sign up
              </button>
            </>
          )}
        </div>
      </div>
      <nav aria-label="Main mobile" className="flex items-center gap-1 overflow-x-auto border-t border-line px-3 py-1.5 lg:hidden">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={navClass}>
            <Icon className="hidden size-4 sm:block" />
            {label}
          </NavLink>
        ))}
        <span className="ml-auto shrink-0 pl-2">
          <DataSourceIndicator compact />
        </span>
      </nav>
    </header>
  )
}
