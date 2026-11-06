import { Routes, Route, Navigate } from 'react-router-dom'
import RegisterPage from './pages/RegisterPage'
import AdminConsole from './pages/AdminConsole'

export default function App() {
  return (
    <Routes>
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/admin" element={<AdminConsole />} />
      <Route path="*" element={<Navigate to="/register" replace />} />
    </Routes>
  )
}
