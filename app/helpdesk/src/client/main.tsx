import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AppProvider } from './platform/i18n'
import { SessionProvider } from './platform/session'
import { ToastProvider } from './components/ui'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <SessionProvider>
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </SessionProvider>
    </AppProvider>
  </StrictMode>,
)
