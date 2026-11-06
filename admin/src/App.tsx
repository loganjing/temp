import { Routes, Route, Navigate } from 'react-router-dom';
import { NavBar } from 'antd-mobile';
import VisitorList from './pages/VisitorList';
import VisitorDetail from './pages/VisitorDetail';

export default function App() {
  return (
    <>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <NavBar back={null}>访客审批</NavBar>
              <main className="app-content">
                <VisitorList />
              </main>
            </>
          }
        />
        <Route
          path="/visitors/:id"
          element={<VisitorDetail />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
