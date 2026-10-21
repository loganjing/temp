// 认证与当前用户（契约第 1 节）。
import { apiRequest } from '../platform/api-client'
import type { CurrentUser, LoginRequest, LoginResponse } from '../contracts/types'

const TOKEN_KEY = 'platform-token'

export async function login(body: LoginRequest): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) })
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function readToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

/** 登出（幂等，204）；失败不阻断本地会话清理。 */
export async function logout(): Promise<void> {
  await apiRequest<void>('/api/auth/logout', { method: 'POST' })
}

export async function fetchMe(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/api/me')
}
