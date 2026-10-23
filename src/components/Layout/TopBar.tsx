import type { ReactNode } from 'react';

interface TopBarProps {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export function TopBar({ title, actions, children }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <h1 className="topbar__title">{title}</h1>
      </div>
      <div className="topbar__right">
        {children}
        {actions}
      </div>
    </header>
  );
}
