import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AppProvider } from './platform/i18n'
import { CurrentUserProvider } from './context/CurrentUser'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CurrentUserProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </CurrentUserProvider>
    </BrowserRouter>
  </StrictMode>,
)
