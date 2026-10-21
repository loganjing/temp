// 公司、分类、业务组、成员与分类自动分配规则（契约第 3-5 节，均 admin 授权；categories 为 AUTH）。
import { apiRequest, buildQuery } from '../platform/api-client'
import type { Company, GroupMember, GroupSummary, RoutingRule } from '../contracts/types'

export async function listCompanies(): Promise<{ items: Company[] }> {
  return apiRequest<{ items: Company[] }>('/api/companies')
}

export async function createCompany(name: string): Promise<Company> {
  return apiRequest<Company>('/api/companies', { method: 'POST', body: JSON.stringify({ name }) })
}

export async function listCategories(): Promise<{ items: { id: number; name: string }[] }> {
  return apiRequest<{ items: { id: number; name: string }[] }>('/api/categories')
}

export async function listGroups(companyId: number): Promise<{ items: GroupSummary[] }> {
  return apiRequest<{ items: GroupSummary[] }>(`/api/companies/${companyId}/groups`)
}

export async function createGroup(companyId: number, name: string): Promise<GroupSummary> {
  return apiRequest<GroupSummary>(`/api/companies/${companyId}/groups`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function renameGroup(groupId: number, name: string): Promise<GroupSummary> {
  return apiRequest<GroupSummary>(`/api/groups/${groupId}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  })
}

export async function deleteGroup(groupId: number): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}`, { method: 'DELETE' })
}

export async function listGroupMembers(groupId: number): Promise<{ items: GroupMember[] }> {
  return apiRequest<{ items: GroupMember[] }>(`/api/groups/${groupId}/members`)
}

export async function addGroupMember(groupId: number, userId: number): Promise<GroupMember> {
  return apiRequest<GroupMember>(`/api/groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

export async function removeGroupMember(groupId: number, userId: number): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' })
}

export async function listRoutingRules(companyId: number): Promise<{ items: RoutingRule[] }> {
  return apiRequest<{ items: RoutingRule[] }>(`/api/companies/${companyId}/routing-rules`)
}

export async function createRoutingRule(
  companyId: number,
  categoryId: number,
  groupId: number,
): Promise<RoutingRule> {
  return apiRequest<RoutingRule>(`/api/companies/${companyId}/routing-rules`, {
    method: 'POST',
    body: JSON.stringify({ categoryId, groupId }),
  })
}

export async function updateRoutingRule(ruleId: number, groupId: number): Promise<RoutingRule> {
  return apiRequest<RoutingRule>(`/api/routing-rules/${ruleId}`, {
    method: 'PUT',
    body: JSON.stringify({ groupId }),
  })
}

export async function deleteRoutingRule(ruleId: number): Promise<void> {
  await apiRequest<void>(`/api/routing-rules/${ruleId}`, { method: 'DELETE' })
}

/** 用户列表（成员添加下拉数据源；契约第 2 节，admin）。 */
export async function listUsersForCompany(companyId: number) {
  return apiRequest<{
    items: { userId: number; displayName: string; username: string; department: string }[]
    total: number
    page: number
    pageSize: number
  }>(`/api/users${buildQuery({ companyId, pageSize: 100 })}`)
}
