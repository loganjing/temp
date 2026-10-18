import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import BillDetailPage from './pages/BillDetailPage'
import BillListPage from './pages/BillListPage'
import BillNewPage from './pages/BillNewPage'
import BillPrintPage from './pages/BillPrintPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="app-header no-print">
          <div className="app-title">资产领用单</div>
          <Link to="/bills/new" className="btn btn-primary">新建领用单</Link>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<BillListPage />} />
            <Route path="/bills/new" element={<BillNewPage />} />
            <Route path="/bills/:id" element={<BillDetailPage />} />
            <Route path="/bills/:id/print" element={<BillPrintPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
