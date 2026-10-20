import { apiRequest } from '../platform/api-client'
import type {
  CategoryListResponse,
  CategoryRule,
  CategoryRuleListResponse,
  Group,
  GroupListResponse,
} from '../platform/types'

export function listGroups(): Promise<GroupListResponse> {
  return apiRequest<GroupListResponse>('/api/groups')
}

export function createGroup(name: string): Promise<{ group: Group }> {
  return apiRequest<{ group: Group }>('/api/groups', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export function updateGroupMembers(id: number, userIds: string[]): Promise<{ group: Group }> {
  return apiRequest<{ group: Group }>(`/api/groups/${id}/members`, {
    method: 'PUT',
    body: JSON.stringify({ userIds }),
  })
}

export function deleteGroup(id: number): Promise<void> {
  return apiRequest<void>(`/api/groups/${id}`, { method: 'DELETE' })
}

export function listCategories(): Promise<CategoryListResponse> {
  return apiRequest<CategoryListResponse>('/api/categories')
}

export function createCategory(category: string): Promise<void> {
  return apiRequest<void>('/api/categories', {
    method: 'POST',
    body: JSON.stringify({ category }),
  })
}

export function deleteCategory(category: string): Promise<void> {
  return apiRequest<void>(`/api/categories/${encodeURIComponent(category)}`, { method: 'DELETE' })
}

export function listCategoryRules(): Promise<CategoryRuleListResponse> {
  return apiRequest<CategoryRuleListResponse>('/api/category-rules')
}

export function saveCategoryRule(category: string, groupId: number): Promise<{ rule: CategoryRule }> {
  return apiRequest<{ rule: CategoryRule }>(`/api/category-rules/${encodeURIComponent(category)}`, {
    method: 'PUT',
    body: JSON.stringify({ groupId }),
  })
}

export function deleteCategoryRule(category: string): Promise<void> {
  return apiRequest<void>(`/api/category-rules/${encodeURIComponent(category)}`, { method: 'DELETE' })
}
