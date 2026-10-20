import { apiRequest } from '../platform/api-client'
import type { LoginResponse, MeResponse } from '../platform/types'

export function login(username: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function fetchCurrentUser(): Promise<MeResponse> {
  return apiRequest<MeResponse>('/api/auth/me')
}
