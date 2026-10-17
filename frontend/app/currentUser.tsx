import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '../api/types';
import { apiErrorMessage, listUsers, setCurrentUserId } from '../api/client';

interface CurrentUserContextValue {
  users: User[];
  loading: boolean;
  error: string | null;
  currentUser: User | null;
  reload: () => void;
  switchUser: (user: User) => void;
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

/** 当前用户切换器状态：会话内 UI 状态，不持久化业务数据。 */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [reloadFlag, setReloadFlag] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listUsers()
      .then((list) => {
        if (cancelled) return;
        setUsers(list);
        setUserId((prev) => (prev !== null && list.some((u) => u.id === prev) ? prev : list[0]?.id ?? null));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadFlag]);

  const currentUser = useMemo(
    () => users.find((u) => u.id === userId) ?? null,
    [users, userId],
  );

  // 同步 X-User-Id 到 API 客户端。
  useEffect(() => {
    setCurrentUserId(currentUser !== null ? currentUser.id : null);
  }, [currentUser]);

  const switchUser = useCallback((user: User) => {
    setUserId(user.id);
  }, []);

  const reload = useCallback(() => {
    setReloadFlag((n) => n + 1);
  }, []);

  const value = useMemo<CurrentUserContextValue>(
    () => ({ users, loading, error, currentUser, reload, switchUser }),
    [users, loading, error, currentUser, reload, switchUser],
  );

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext);
  if (ctx === null) throw new Error('useCurrentUser 必须在 CurrentUserProvider 内使用');
  return ctx;
}
