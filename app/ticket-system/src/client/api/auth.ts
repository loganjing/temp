import { apiRequest } from '../platform/api-client'
import type { LoginResult, MeResult } from './types'

export const authApi = {
  // 首次账户初始化沿用包内既有本地账号接线；服务端未提供时由调用方降级到登录页。
  bootstrapStatus: () => apiRequest<{ required: boolean }>('/api/auth/bootstrap-status'),
  bootstrap: (body: { name: string; email: string; password: string }) =>
    apiRequest<{ ok: boolean }>('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    apiRequest<LoginResult>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => apiRequest<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () => apiRequest<MeResult>('/api/auth/me'),
  changePassword: (body: { password: string }) =>
    apiRequest<{ ok: boolean }>('/api/auth/password', { method: 'POST', body: JSON.stringify(body) }),
}
