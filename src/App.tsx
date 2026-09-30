import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

const GamesPage = lazy(() => import('./features/games/GamesPage'))
const GameFormPage = lazy(() => import('./features/games/GameFormPage'))
const OnboardingPage = lazy(() => import('./features/games/OnboardingPage'))
const TrackerPage = lazy(() => import('./features/tracker/TrackerPage'))
const GameSummaryPage = lazy(() => import('./features/stats/GameSummaryPage'))
const SeasonPage = lazy(() => import('./features/stats/SeasonPage'))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<GamesPage />} />
          <Route path="/welcome" element={<OnboardingPage />} />
          <Route path="/games/new" element={<GameFormPage />} />
          <Route path="/games/:id/edit" element={<GameFormPage />} />
          <Route path="/games/:id/track" element={<TrackerPage />} />
          <Route path="/games/:id" element={<GameSummaryPage />} />
          <Route path="/season" element={<SeasonPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
