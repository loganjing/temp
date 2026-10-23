import { useCallback, useEffect, useState } from 'react';
import { areasApi, jobsApi, taskInstancesApi } from './api/client.js';
import Sidebar, { NAV_ITEMS } from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import { ToastProvider, useToast } from './components/Toast.jsx';
import AreasPage from './pages/AreasPage.jsx';
import JobsPage from './pages/JobsPage.jsx';
import TaskInstancesPage from './pages/TaskInstancesPage.jsx';
import ObstaclesPage from './pages/ObstaclesPage.jsx';
import SuppliesPage from './pages/SuppliesPage.jsx';
import QualityReportPage from './pages/QualityReportPage.jsx';

function AppContent() {
  const [active, setActive] = useState('areas');
  const [areas, setAreas] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [taskInstances, setTaskInstances] = useState([]);
  const { showError } = useToast();

  // 加载共享数据（多个页面依赖的列表）
  const loadSharedAreas = useCallback(async () => {
    try {
      const data = await areasApi.list();
      setAreas(data);
    } catch (e) {
      showError(e.message);
    }
  }, [showError]);

  const loadSharedJobs = useCallback(async () => {
    try {
      const data = await jobsApi.list();
      setJobs(data);
    } catch (e) {
      showError(e.message);
    }
  }, [showError]);

  const loadSharedTaskInstances = useCallback(async () => {
    try {
      const data = await taskInstancesApi.list();
      setTaskInstances(data);
    } catch (e) {
      showError(e.message);
    }
  }, [showError]);

  useEffect(() => {
    loadSharedAreas();
    loadSharedJobs();
    loadSharedTaskInstances();
  }, [loadSharedAreas, loadSharedJobs, loadSharedTaskInstances]);

  // 切换页面时刷新共享数据
  useEffect(() => {
    loadSharedAreas();
    loadSharedJobs();
    loadSharedTaskInstances();
  }, [active, loadSharedAreas, loadSharedJobs, loadSharedTaskInstances]);

  function renderPage() {
    switch (active) {
      case 'areas':
        return <AreasPage />;
      case 'jobs':
        return <JobsPage areas={areas} onNavigateToInstances={() => setActive('task-instances')} />;
      case 'task-instances':
        return <TaskInstancesPage jobs={jobs} />;
      case 'obstacles':
        return <ObstaclesPage taskInstances={taskInstances} />;
      case 'supplies':
        return <SuppliesPage />;
      case 'reports':
        return <QualityReportPage areas={areas} />;
      default:
        return <AreasPage />;
    }
  }

  function renderActions() {
    switch (active) {
      case 'areas':
        return null; // 空状态有创建入口
      case 'reports':
        return null; // 报告页面按钮内嵌
      default:
        return null;
    }
  }

  return (
    <div className="app-shell">
      <Sidebar active={active} onNavigate={setActive} />
      <div className="main-area">
        <TopBar active={active} actions={renderActions()} />
        <div className="content">
          {renderPage()}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
