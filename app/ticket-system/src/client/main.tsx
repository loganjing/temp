import { BrowserRouter } from 'react-router-dom'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppProvider } from './app-context'
import { Route, Routes } from 'react-router-dom'
import WorkbenchPage from './pages/workbench'
import NewTicketPage from './pages/new-ticket'
import GroupsPage from './pages/groups'
import RulesPage from './pages/rules'
import UsersPage from './pages/users'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<WorkbenchPage />} />
            <Route path="tickets/new" element={<NewTicketPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="rules" element={<RulesPage />} />
            <Route path="users" element={<UsersPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  </StrictMode>,
)
