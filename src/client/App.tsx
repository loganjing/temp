import { useState } from 'react';
import { ToastProvider } from './context/ToastContext';
import { Sidebar, getModuleLabel, type ModuleKey } from '../components/Layout/Sidebar';
import { MaturityPage } from '../pages/MaturityPage';
import { TasksPage } from '../pages/TasksPage';
import { MonitoringPage } from '../pages/MonitoringPage';
import { ExceptionsPage } from '../pages/ExceptionsPage';
import { StatisticsPage } from '../pages/StatisticsPage';

export function App() {
  const [activeModule, setActiveModule] = useState<ModuleKey>('maturity');

  function renderModule() {
    switch (activeModule) {
      case 'maturity':
        return <MaturityPage />;
      case 'tasks':
        return <TasksPage />;
      case 'monitoring':
        return <MonitoringPage />;
      case 'exceptions':
        return <ExceptionsPage />;
      case 'statistics':
        return <StatisticsPage />;
      default:
        return <MaturityPage />;
    }
  }

  return (
    <ToastProvider>
      <div className="app">
        <Sidebar activeModule={activeModule} onModuleChange={setActiveModule} />
        <main className="app__main">
          <div key={activeModule} className="app__content">
            {renderModule()}
          </div>
          <footer className="app__footer">
            <span>{getModuleLabel(activeModule)} · 农业采摘管理系统</span>
          </footer>
        </main>
      </div>
    </ToastProvider>
  );
}
