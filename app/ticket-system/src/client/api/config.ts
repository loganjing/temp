import { apiJsonRequest, apiRequest } from '../platform/api-client'
import { buildQuery } from './helpers'
import type { CategoryRule, Company, Group } from './types'

export function fetchCompanies(): Promise<{ items: Company[] }> {
  return apiRequest('/api/companies')
}

export function fetchGroups(companyId: string): Promise<{ items: Group[] }> {
  return apiRequest(`/api/groups${buildQuery({ companyId })}`)
}

export function createGroup(input: { companyId: string; name: string; memberIds?: string[] }): Promise<Group> {
  return apiJsonRequest('/api/groups', 'POST', input)
}

export function updateGroup(id: string, input: { name?: string; memberIds?: string[] }): Promise<Group> {
  return apiJsonRequest(`/api/groups/${encodeURIComponent(id)}`, 'PUT', input)
}

export function fetchCategoryRules(companyId: string): Promise<{ items: CategoryRule[] }> {
  return apiRequest(`/api/category-rules${buildQuery({ companyId })}`)
}

export function createCategoryRule(input: { companyId: string; category: string; groupId: string }): Promise<CategoryRule> {
  return apiJsonRequest('/api/category-rules', 'POST', input)
}

export function deleteCategoryRule(id: string): Promise<void> {
  return apiJsonRequest<void>(`/api/category-rules/${encodeURIComponent(id)}`, 'DELETE')
}
