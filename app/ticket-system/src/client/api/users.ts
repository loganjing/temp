// 用户管理（契约第 2 节，admin）。
import { apiRequest, buildQuery } from '../platform/api-client'
import type { CreateUserRequest, Paged, UpdateUserProfileRequest, UserItem } from '../contracts/types'

export async function listUsers(query: { companyId?: number; page?: number; pageSize?: number } = {}): Promise<Paged<UserItem>> {
  return apiRequest<Paged<UserItem>>(`/api/users${buildQuery({
    companyId: query.companyId,
    page: query.page,
    pageSize: query.pageSize,
  })}`)
}

export async function createUser(body: CreateUserRequest): Promise<UserItem> {
  return apiRequest<UserItem>('/api/users', { method: 'POST', body: JSON.stringify(body) })
}

export async function updateUserProfile(
  userId: number,
  body: UpdateUserProfileRequest,
): Promise<UserItem> {
  return apiRequest<UserItem>(`/api/users/${userId}/profile`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}
