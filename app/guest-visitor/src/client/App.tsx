import { BrowserRouter, Route, Routes } from 'react-router-dom'
import VisitorListPage from './pages/VisitorListPage'
import VisitorDetailPage from './pages/VisitorDetailPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<VisitorListPage />} />
        <Route path="/visitors/:id" element={<VisitorDetailPage />} />
      </Routes>
    </BrowserRouter>
  )
}
