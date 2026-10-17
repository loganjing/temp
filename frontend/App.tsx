import { useState, type ReactNode } from 'react';
import { Building2, Inbox, LifeBuoy, ListChecks } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CurrentUserProvider, useCurrentUser } from './app/currentUser';
import { ToastProvider } from './app/toast';
import { UserSwitcher } from './components/UserSwitcher';
import { ErrorBanner, Spinner } from './components/common';
import { TicketsView } from './views/TicketsView';
import { QueueView } from './views/QueueView';
import { CompanyAdminView } from './views/CompanyAdminView';

type ViewId = 'tickets' | 'queue' | 'company';

const VIEW_TITLES: Record<ViewId, string> = {
  tickets: '工单列表',
  queue: '待分配队列',
  company: '公司管理',
};

const NAV_ITEMS: ReadonlyArray<{ id: ViewId; label: string; icon: LucideIcon }> = [
  { id: 'tickets', label: VIEW_TITLES.tickets, icon: ListChecks },
  { id: 'queue', label: VIEW_TITLES.queue, icon: Inbox },
  { id: 'company', label: VIEW_TITLES.company, icon: Building2 },
];

export default function App() {
  return (
    <ToastProvider>
      <CurrentUserProvider>
        <AppShell />
      </CurrentUserProvider>
    </ToastProvider>
  );
}

function AppShell() {
  const [view, setView] = useState<ViewId>('tickets');
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const { currentUser, loading, error, reload } = useCurrentUser();

  const selectTicket = (id: number | null) => setSelectedTicketId(id);

  let workspace: ReactNode;
  if (loading) {
    workspace = (
      <div className="workspace-status">
        <Spinner label="正在加载用户数据…" />
      </div>
    );
  } else if (error !== null) {
    workspace = (
      <div className="workspace-status">
        <ErrorBanner message={`用户列表加载失败：${error}`} onRetry={reload} />
      </div>
    );
  } else if (currentUser === null) {
    workspace = (
      <div className="workspace-status">
        <ErrorBanner message="没有可用用户，无法进入工作台" onRetry={reload} />
      </div>
    );
  } else if (view === 'company') {
    workspace = <CompanyAdminView key={currentUser.id} />;
  } else if (view === 'queue') {
    workspace = (
      <QueuePage
        key={currentUser.id}
        selectedTicketId={selectedTicketId}
        onSelectTicket={selectTicket}
      />
    );
  } else {
    workspace = (
      <TicketsPage
        key={currentUser.id}
        selectedTicketId={selectedTicketId}
        onSelectTicket={selectTicket}
      />
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <LifeBuoy size={17} className="brand-icon" aria-hidden />
          <span className="brand-name">工单工作台</span>
        </div>
        <nav className="breadcrumb" aria-label="面包屑">
          <span>{VIEW_TITLES[view]}</span>
          {view !== 'company' && selectedTicketId !== null && (
            <>
              <span className="crumb-sep">/</span>
              <span>工单详情</span>
            </>
          )}
        </nav>
        <div className="topbar-spacer" />
        <UserSwitcher />
      </header>
      <div className="app-body">
        <nav className="sidenav" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`sidenav-item${view === item.id ? ' active' : ''}`}
                onClick={() => setView(item.id)}
                aria-current={view === item.id ? 'page' : undefined}
              >
                <Icon size={16} aria-hidden />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <main className="workspace">{workspace}</main>
      </div>
    </div>
  );
}

function TicketsPage(props: { selectedTicketId: number | null; onSelectTicket: (id: number | null) => void }) {
  return <TicketsView {...props} />;
}

function QueuePage(props: { selectedTicketId: number | null; onSelectTicket: (id: number | null) => void }) {
  return <QueueView {...props} />;
}
