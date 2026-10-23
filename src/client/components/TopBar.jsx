import { NAV_ITEMS } from './Sidebar.jsx';

export default function TopBar({ active, actions }) {
  const item = NAV_ITEMS.find((n) => n.key === active);
  return (
    <header className="topbar">
      <div className="topbar-title">{item ? item.label : ''}</div>
      <div className="topbar-actions">{actions}</div>
    </header>
  );
}
