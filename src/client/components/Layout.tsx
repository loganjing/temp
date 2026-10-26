/**
 * 布局组件 — 应用壳：左侧边栏 + 顶部上下文栏 + 主工作区
 */
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <TopBar />
        <div className="page-content">{children}</div>
      </div>
    </div>
  );
}
