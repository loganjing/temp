import { apiRequest } from '../platform/api-client'
import { buildQuery } from './query'
import type {
  AssignmentRule,
  BusinessGroup,
  Category,
  Company,
  Department,
  ListResult,
  UserListResult,
  UserSummary,
} from './types'

export const usersApi = {
  list: () => apiRequest<UserListResult>('/api/users'),
  create: (body: { email: string; password: string; displayName: string; companyId: number | null; departmentId: number | null }) =>
    apiRequest<UserSummary>('/api/users', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: { displayName?: string; companyId?: number | null; departmentId?: number | null }) =>
    apiRequest<UserSummary>(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
}

export const companiesApi = {
  list: () => apiRequest<ListResult<Company>>('/api/companies'),
  create: (name: string) => apiRequest<Company>('/api/companies', { method: 'POST', body: JSON.stringify({ name }) }),
  departments: (companyId: number) => apiRequest<ListResult<Department>>(`/api/companies/${companyId}/departments`),
  createDepartment: (companyId: number, name: string) =>
    apiRequest<Department>(`/api/companies/${companyId}/departments`, { method: 'POST', body: JSON.stringify({ name }) }),
}

export const categoriesApi = {
  list: () => apiRequest<ListResult<Category>>('/api/categories'),
  create: (name: string) => apiRequest<Category>('/api/categories', { method: 'POST', body: JSON.stringify({ name }) }),
}

export const businessGroupsApi = {
  list: (companyId: number) => apiRequest<ListResult<BusinessGroup>>(`/api/business-groups${buildQuery({ companyId })}`),
  create: (body: { companyId: number; name: string }) =>
    apiRequest<BusinessGroup>('/api/business-groups', { method: 'POST', body: JSON.stringify(body) }),
  addMember: (groupId: number, userId: number) =>
    apiRequest<{ groupId: number; userId: number }>(`/api/business-groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  removeMember: (groupId: number, userId: number) =>
    apiRequest<{ success: boolean }>(`/api/business-groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
}

export const assignmentRulesApi = {
  list: (companyId: number) => apiRequest<ListResult<AssignmentRule>>(`/api/assignment-rules${buildQuery({ companyId })}`),
  save: (body: { companyId: number; categoryId: number; targetGroupId: number }) =>
    apiRequest<{ id: number; companyId: number; categoryId: number; targetGroupId: number }>('/api/assignment-rules', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}
