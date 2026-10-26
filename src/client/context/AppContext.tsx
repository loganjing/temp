/**
 * 应用级上下文 — 页面导航 + SSE 连接状态
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useSSEConnection } from '../hooks/useSSE';
import type { SSEConnectionStatus } from '../types';

export type PageId = 'overview' | 'queue' | 'robots' | 'alerts';

interface AppContextValue {
  currentPage: PageId;
  navigate: (page: PageId) => void;
  sseStatus: SSEConnectionStatus;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentPage, setCurrentPage] = useState<PageId>('overview');
  const sseStatus = useSSEConnection();

  const navigate = useCallback((page: PageId) => {
    setCurrentPage(page);
  }, []);

  return (
    <AppContext.Provider value={{ currentPage, navigate, sseStatus }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within AppProvider');
  }
  return ctx;
}
