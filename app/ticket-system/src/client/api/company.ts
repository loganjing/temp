import { apiRequest } from '../platform/api-client'
import type {
  AutoAssignRule,
  BusinessGroup,
  BusinessGroupMember,
  TicketCategory,
} from '../types'

export const groupsApi = {
  list: (companyId: string) =>
    apiRequest<BusinessGroup[]>(`/api/companies/${encodeURIComponent(companyId)}/groups`),

  create: (companyId: string, name: string) =>
    apiRequest<BusinessGroup>(`/api/companies/${encodeURIComponent(companyId)}/groups`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  members: (companyId: string, groupId: string) =>
    apiRequest<BusinessGroupMember[]>(
      `/api/companies/${encodeURIComponent(companyId)}/groups/${encodeURIComponent(groupId)}/members`,
    ),

  addMember: (companyId: string, groupId: string, userId: string) =>
    apiRequest<BusinessGroupMember>(
      `/api/companies/${encodeURIComponent(companyId)}/groups/${encodeURIComponent(groupId)}/members`,
      { method: 'POST', body: JSON.stringify({ userId }) },
    ),

  removeMember: (companyId: string, groupId: string, userId: string) =>
    apiRequest<{ success: true }>(
      `/api/companies/${encodeURIComponent(companyId)}/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    ),

  rules: (companyId: string) =>
    apiRequest<AutoAssignRule[]>(`/api/companies/${encodeURIComponent(companyId)}/auto-assign-rules`),

  createRule: (companyId: string, categoryId: string, targetGroupId: string) =>
    apiRequest<AutoAssignRule>(
      `/api/companies/${encodeURIComponent(companyId)}/auto-assign-rules`,
      { method: 'POST', body: JSON.stringify({ categoryId, targetGroupId }) },
    ),
}

export const categoriesApi = {
  list: (companyId: string) =>
    apiRequest<TicketCategory[]>(`/api/companies/${encodeURIComponent(companyId)}/categories`),

  create: (companyId: string, name: string) =>
    apiRequest<TicketCategory>(`/api/companies/${encodeURIComponent(companyId)}/categories`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
}
