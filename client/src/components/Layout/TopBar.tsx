import { useLocation } from 'react-router-dom';

const titleMap: Record<string, string> = {
  '/tasks': '任务管理',
  '/monitoring': '实时监控',
  '/statistics': '任务统计',
  '/resources': '设备管理',
  '/map': '地图配置',
};

export function TopBar() {
  const location = useLocation();
  const basePath = '/' + (location.pathname.split('/')[1] ?? '');
  const title = titleMap[basePath] ?? '仓储搬运管理系统';

  return (
    <header className="topbar">
      <h1 className="topbar__title">{title}</h1>
      <div className="topbar__actions">
        <span className="topbar__date">
          {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
        </span>
      </div>
    </header>
  );
}
