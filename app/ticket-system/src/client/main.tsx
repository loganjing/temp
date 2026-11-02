import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppProvider } from './platform/i18n'

async function bootstrap() {
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK_API === 'true') {
    const { installMockApi } = await import('./platform/mock-api')
    installMockApi()
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppProvider><App /></AppProvider>
    </StrictMode>,
  )
}

void bootstrap()