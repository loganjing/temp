import { apiJsonRequest, apiRequest } from '../platform/api-client'
import { buildQuery } from './helpers'
import type { CurrentUser, LoginResponse, UserListItem } from './types'

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiJsonRequest('/api/auth/login', 'POST', { email, password })
}

export function fetchMe(): Promise<CurrentUser> {
  return apiRequest('/api/me')
}

export function fetchUsers(companyId?: string): Promise<{ items: UserListItem[] }> {
  return apiRequest(`/api/users${buildQuery({ companyId })}`)
}
