import { apiRequest } from '../platform/api-client'
import type { UserInfo } from '../types'

export const authApi = {
  bootstrapStatus: () => apiRequest<{ required: boolean }>('/api/auth/bootstrap-status'),

  bootstrap: (body: { name: string; email: string; password: string }) =>
    apiRequest('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    apiRequest<{ token: string; user: UserInfo }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  me: () => apiRequest<UserInfo>('/api/auth/me'),

  logout: () => apiRequest<{ success: true }>('/api/auth/logout', { method: 'POST' }),

  changePassword: (body: { password: string }) =>
    apiRequest('/api/auth/password', { method: 'POST', body: JSON.stringify(body) }),
}

// 用户列表（管理员按公司筛选），用于业务组添加成员等场景。
export const usersApi = {
  list: (companyId?: string) => {
    const sp = new URLSearchParams()
    if (companyId) sp.set('companyId', companyId)
    const s = sp.toString()
    return apiRequest<{ users: { id: string; name: string; email: string; phone?: string | null }[]; total: number }>(
      `/api/admin/users${s ? `?${s}` : ''}`,
    )
  },
}
