/**
 * App root: routing + auth guard + layout.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Login';
import { WorkbenchPage } from './pages/Workbench';
import { TicketCreatePage } from './pages/TicketCreate';
import { StatisticsPage } from './pages/Statistics';
import { BusinessGroupsPage } from './pages/BusinessGroups';
import { AssignmentRulesPage } from './pages/AssignmentRules';
import { LoadingSpinner } from './components/ui';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner />;

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/workbench" replace /> : <LoginPage />}
      />
      <Route
        path="/workbench"
        element={
          <ProtectedRoute>
            <WorkbenchPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/workbench/:ticketId"
        element={
          <ProtectedRoute>
            <WorkbenchPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/new"
        element={
          <ProtectedRoute>
            <TicketCreatePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/statistics"
        element={
          <ProtectedRoute>
            <StatisticsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/business-groups"
        element={
          <ProtectedRoute>
            <BusinessGroupsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assignment-rules"
        element={
          <ProtectedRoute>
            <AssignmentRulesPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/workbench" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
