/**
 * 应用根组件 — 页面路由
 */
import { AppProvider, useApp } from './context/AppContext';
import { Layout } from './components/Layout';
import { OverviewPage } from './pages/OverviewPage';
import { QueuePage } from './pages/QueuePage';
import { RobotsPage } from './pages/RobotsPage';
import { AlertsPage } from './pages/AlertsPage';

function PageRouter() {
  const { currentPage } = useApp();

  switch (currentPage) {
    case 'overview':
      return <OverviewPage />;
    case 'queue':
      return <QueuePage />;
    case 'robots':
      return <RobotsPage />;
    case 'alerts':
      return <AlertsPage />;
    default:
      return <OverviewPage />;
  }
}

export default function App() {
  return (
    <AppProvider>
      <Layout>
        <PageRouter />
      </Layout>
    </AppProvider>
  );
}
