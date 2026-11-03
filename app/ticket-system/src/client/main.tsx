import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppProvider } from './platform/i18n'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider><App /></AppProvider>
  </StrictMode>,
)
