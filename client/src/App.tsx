import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from '@/components/common/Toast';
import { AppLayout } from '@/components/Layout/AppLayout';
import { TaskListPage } from '@/pages/tasks/TaskListPage';
import { MonitoringPage } from '@/pages/monitoring/MonitoringPage';
import { StatisticsPage } from '@/pages/statistics/StatisticsPage';
import { ResourceListPage } from '@/pages/resources/ResourceListPage';
import { MapConfigPage } from '@/pages/map/MapConfigPage';

export function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/tasks" element={<TaskListPage />} />
            <Route path="/monitoring" element={<MonitoringPage />} />
            <Route path="/statistics" element={<StatisticsPage />} />
            <Route path="/resources" element={<ResourceListPage />} />
            <Route path="/map" element={<MapConfigPage />} />
            <Route path="*" element={<Navigate to="/tasks" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
