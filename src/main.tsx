import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { RepoProvider } from './data/context'
import { ToastProvider } from './ui'
import '@fontsource/barlow-condensed/latin-700.css'
import '@fontsource/barlow-condensed/latin-800.css'
import './ui/base.css'
import './features/shell/shell.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RepoProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </RepoProvider>
  </StrictMode>,
)
