import {
  Sprout,
  ListChecks,
  Activity,
  AlertTriangle,
  BarChart3,
  Leaf,
} from 'lucide-react';
import type { ReactNode } from 'react';

export type ModuleKey = 'maturity' | 'tasks' | 'monitoring' | 'exceptions' | 'statistics';

interface SidebarProps {
  activeModule: ModuleKey;
  onModuleChange: (key: ModuleKey) => void;
}

interface NavItem {
  key: ModuleKey;
  label: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  { key: 'maturity', label: '成熟度识别', icon: <Sprout size={20} /> },
  { key: 'tasks', label: '采摘任务规划', icon: <ListChecks size={20} /> },
  { key: 'monitoring', label: '作业进度监控', icon: <Activity size={20} /> },
  { key: 'exceptions', label: '异常上报', icon: <AlertTriangle size={20} /> },
  { key: 'statistics', label: '产量统计', icon: <BarChart3 size={20} /> },
];

export function Sidebar({ activeModule, onModuleChange }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <Leaf size={28} className="sidebar__logo" />
        <span className="sidebar__title">农业采摘管理系统</span>
      </div>
      <nav className="sidebar__nav">
        {navItems.map((item) => (
          <button
            key={item.key}
            className={`sidebar__item ${activeModule === item.key ? 'sidebar__item--active' : ''}`}
            onClick={() => onModuleChange(item.key)}
          >
            <span className="sidebar__item-icon">{item.icon}</span>
            <span className="sidebar__item-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

export function getModuleLabel(key: ModuleKey): string {
  const item = navItems.find((n) => n.key === key);
  return item?.label ?? '';
}
