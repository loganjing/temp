import { User } from 'lucide-react';
import { useCurrentUser } from '../app/currentUser';

/** 顶栏当前用户切换器（数据来自 GET /api/users）。 */
export function UserSwitcher() {
  const { users, currentUser, loading, error, reload, switchUser } = useCurrentUser();
  return (
    <div className="user-switcher">
      <span className="user-switcher-label">当前用户</span>
      <span className="user-switcher-select-wrap">
        <User size={14} className="muted-icon" aria-hidden />
        {loading ? (
          <span className="muted small">加载中…</span>
        ) : error !== null ? (
          <span className="user-switcher-error" title={error}>
            用户列表加载失败
          </span>
        ) : (
          <select
            className="select"
            value={currentUser !== null ? currentUser.id : ''}
            onChange={(e) => {
              const id = Number(e.target.value);
              const user = users.find((u) => u.id === id);
              if (user !== undefined) switchUser(user);
            }}
            aria-label="切换当前用户"
          >
            {users.length === 0 && <option value="">（无用户）</option>}
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.company.name}
                {u.isCompanyAdmin ? '（管理员）' : ''}
              </option>
            ))}
          </select>
        )}
      </span>
      {error !== null && (
        <button
          type="button"
          className="icon-btn"
          onClick={reload}
          aria-label="重新加载用户列表"
          title="重新加载用户列表"
        >
          重新加载
        </button>
      )}
    </div>
  );
}
