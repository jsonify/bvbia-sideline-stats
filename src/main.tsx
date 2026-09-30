import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { RepoProvider } from './data/context'
import { ToastProvider } from './ui'
import { BrandingProvider } from './features/branding/BrandingProvider'
import { applyBranding, loadCachedBranding } from './features/branding/theme'
import './ui/base.css'
import './features/shell/shell.css'

applyBranding(loadCachedBranding())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RepoProvider>
      <BrandingProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrandingProvider>
    </RepoProvider>
  </StrictMode>,
)
