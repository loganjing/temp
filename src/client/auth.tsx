/**
 * Authentication context: stores the current user and token.
 * On mount, if a token exists in localStorage, attempts to call
 * GET /api/auth/me to restore the session. If that fails (e.g.
 * backend not running), falls back to null user and the token is
 * cleared.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { AuthUser, LoginRequest } from './types';
import { api, setToken, clearToken, ApiError } from './api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (req: LoginRequest) => Promise<void>;
  logout: () => void;
  hasRole: (role: AuthUser['roles'][number]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('ticket_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .getMe()
      .then((u) => setUser(u))
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (req: LoginRequest) => {
    setError(null);
    try {
      const res = await api.login(req);
      setToken(res.token);
      setUser(res.user);
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 401
          ? '邮箱或密码错误'
          : e instanceof ApiError
            ? e.message
            : '登录失败，请检查网络';
      setError(msg);
      throw e;
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (role: AuthUser['roles'][number]) =>
      user?.roles.includes(role) ?? false,
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
