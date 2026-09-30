import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { RepoProvider } from './data/context'
import './ui/base.css'
import './features/shell/shell.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RepoProvider>
      <App />
    </RepoProvider>
  </StrictMode>,
)
