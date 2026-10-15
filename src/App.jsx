import { lazy, Suspense } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import AppEffects from './AppEffects.jsx'
import AuthModal from './components/AuthModal.jsx'
import Footer from './components/layout/Footer.jsx'
import Header from './components/layout/Header.jsx'
import ResetBalanceModal from './components/ResetBalanceModal.jsx'
import ErrorBoundary from './components/ui/ErrorBoundary.jsx'
import { PageSkeleton } from './components/ui/Skeleton.jsx'
import Toaster from './components/ui/Toaster.jsx'
import ScrollToTop from './components/layout/ScrollToTop.jsx'

const HomePage = lazy(() => import('./pages/HomePage.jsx'))
const MarketPage = lazy(() => import('./pages/MarketPage.jsx'))
const PortfolioPage = lazy(() => import('./pages/PortfolioPage.jsx'))
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage.jsx'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'))

function AppRoutes() {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary key={pathname}>
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/market/:id" element={<MarketPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppEffects />
      <ScrollToTop />
      <div className="flex min-h-screen flex-col">
        <button
          type="button"
          onClick={() => document.getElementById('main')?.focus()}
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-primary-500 focus:px-3 focus:py-2 focus:text-white"
        >
          Skip to content
        </button>
        <Header />
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          <AppRoutes />
        </main>
        <Footer />
      </div>
      <AuthModal />
      <ResetBalanceModal />
      <Toaster />
    </HashRouter>
  )
}
