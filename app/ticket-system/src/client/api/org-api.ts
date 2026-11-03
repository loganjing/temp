import { apiRequest } from '../platform/api-client'
import type { Company, Department, BusinessGroup, GroupMember, UserItem, AssignmentRule } from './types'

export function listCompanies(): Promise<Company[]> {
  return apiRequest<Company[]>('/api/companies')
}

export function createCompany(name: string): Promise<Company> {
  return apiRequest<Company>('/api/companies', { method: 'POST', body: JSON.stringify({ name }) })
}

export function listDepartments(companyId: string): Promise<Department[]> {
  return apiRequest<Department[]>(`/api/companies/${encodeURIComponent(companyId)}/departments`)
}

export function createDepartment(companyId: string, name: string): Promise<Department> {
  return apiRequest<Department>(`/api/companies/${encodeURIComponent(companyId)}/departments`, { method: 'POST', body: JSON.stringify({ name }) })
}

export function listGroups(companyId: string): Promise<BusinessGroup[]> {
  return apiRequest<BusinessGroup[]>(`/api/companies/${encodeURIComponent(companyId)}/groups`)
}

export function createGroup(companyId: string, name: string): Promise<BusinessGroup> {
  return apiRequest<BusinessGroup>(`/api/companies/${encodeURIComponent(companyId)}/groups`, { method: 'POST', body: JSON.stringify({ name }) })
}

export function listMembers(companyId: string, groupId: string): Promise<GroupMember[]> {
  return apiRequest<GroupMember[]>(`/api/companies/${encodeURIComponent(companyId)}/groups/${encodeURIComponent(groupId)}/members`)
}

export function addMember(companyId: string, groupId: string, userId: string): Promise<GroupMember> {
  return apiRequest<GroupMember>(`/api/companies/${encodeURIComponent(companyId)}/groups/${encodeURIComponent(groupId)}/members`, { method: 'POST', body: JSON.stringify({ userId }) })
}

export function removeMember(companyId: string, groupId: string, userId: string): Promise<void> {
  return apiRequest<void>(`/api/companies/${encodeURIComponent(companyId)}/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

export function listAssignmentRules(companyId: string): Promise<AssignmentRule[]> {
  return apiRequest<AssignmentRule[]>(`/api/companies/${encodeURIComponent(companyId)}/assignment-rules`)
}

export function createAssignmentRule(companyId: string, category: string, groupId: string): Promise<AssignmentRule> {
  return apiRequest<AssignmentRule>(`/api/companies/${encodeURIComponent(companyId)}/assignment-rules`, { method: 'POST', body: JSON.stringify({ category, groupId }) })
}

export function listUsers(companyId?: string): Promise<UserItem[]> {
  const params = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
  return apiRequest<UserItem[]>(`/api/users${params}`)
}
