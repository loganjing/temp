import type {
  AssignmentRule,
  BusinessGroup,
  Company,
  Evaluation,
  GroupMember,
  ItemListResponse,
  Reply,
  SubmitterInfo,
  TicketDetail,
  TicketListResponse,
  TransferRecord,
} from '../types'

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

function camelCaseResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelCaseResponse)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
    key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
    camelCaseResponse(nested),
  ]))
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {}
  if (options?.body) headers['Content-Type'] = 'application/json'
  Object.assign(headers, options?.headers)

  const response = await fetch(path, { ...options, headers })
  const data: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined)
  if (response.ok) return camelCaseResponse(data) as T

  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined
  const rawError = body?.error
  const detail = rawError && typeof rawError === 'object' ? (rawError as Record<string, unknown>) : undefined
  const message =
    typeof detail?.message === 'string' ? detail.message
    : typeof rawError === 'string' ? rawError
    : `HTTP ${response.status}`
  const code =
    typeof detail?.code === 'string' ? detail.code
    : typeof body?.code === 'string' ? body.code
    : undefined
  throw new ApiRequestError(message, response.status, code)
}

// === Ticket API ===

export const ticketApi = {
  list(params?: { status?: string; slaPriority?: string; category?: string; groupId?: string; q?: string }): Promise<TicketListResponse> {
    const qs = new URLSearchParams()
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v) qs.set(k, v)
      }
    }
    const query = qs.toString()
    return apiRequest(`/api/tickets${query ? '?' + query : ''}`)
  },
  get(id: string): Promise<TicketDetail> {
    return apiRequest(`/api/tickets/${id}`)
  },
  create(body: {
    subject: string; description: string; category: string; slaPriority: string
    submitterName: string; submitterCompanyId: string; submitterDepartment: string; submitterEmail: string
  }): Promise<TicketDetail> {
    return apiRequest('/api/tickets', { method: 'POST', body: JSON.stringify(body) })
  },
  updateStatus(id: string, status: string): Promise<TicketDetail> {
    return apiRequest(`/api/tickets/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
  },
  assign(id: string, groupId: string): Promise<TicketDetail> {
    return apiRequest(`/api/tickets/${id}/assign`, { method: 'POST', body: JSON.stringify({ groupId }) })
  },
  transfer(id: string, toGroupId: string, transferredBy: string): Promise<TicketDetail> {
    return apiRequest(`/api/tickets/${id}/transfer`, { method: 'POST', body: JSON.stringify({ toGroupId, transferredBy }) })
  },
  complete(id: string, handlerMemberId: string, handlerName: string): Promise<TicketDetail> {
    return apiRequest(`/api/tickets/${id}/complete`, { method: 'POST', body: JSON.stringify({ handlerMemberId, handlerName }) })
  },
  getSubmitterInfo(id: string): Promise<SubmitterInfo> {
    return apiRequest(`/api/tickets/${id}/submitter-info`)
  },
  getReplies(id: string): Promise<ItemListResponse<Reply>> {
    return apiRequest(`/api/tickets/${id}/replies`)
  },
  addReply(id: string, replierName: string, content: string): Promise<Reply> {
    return apiRequest(`/api/tickets/${id}/replies`, { method: 'POST', body: JSON.stringify({ replierName, content }) })
  },
  getTransfers(id: string): Promise<ItemListResponse<TransferRecord>> {
    return apiRequest(`/api/tickets/${id}/transfers`)
  },
  getEvaluation(id: string): Promise<Evaluation> {
    return apiRequest(`/api/tickets/${id}/evaluation`)
  },
  addEvaluation(id: string, rating: number, comment?: string): Promise<Evaluation> {
    return apiRequest(`/api/tickets/${id}/evaluation`, { method: 'POST', body: JSON.stringify({ rating, comment }) })
  },
}

// === Company API ===

export const companyApi = {
  list(): Promise<ItemListResponse<Company>> {
    return apiRequest('/api/companies')
  },
  create(name: string): Promise<Company> {
    return apiRequest('/api/companies', { method: 'POST', body: JSON.stringify({ name }) })
  },
  getGroups(companyId: string): Promise<ItemListResponse<BusinessGroup>> {
    return apiRequest(`/api/companies/${companyId}/groups`)
  },
  createGroup(companyId: string, name: string): Promise<BusinessGroup> {
    return apiRequest(`/api/companies/${companyId}/groups`, { method: 'POST', body: JSON.stringify({ name }) })
  },
}

// === Group Member API ===

export const groupApi = {
  getMembers(groupId: string): Promise<ItemListResponse<GroupMember>> {
    return apiRequest(`/api/groups/${groupId}/members`)
  },
  addMember(groupId: string, name: string, email: string): Promise<GroupMember> {
    return apiRequest(`/api/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ name, email }) })
  },
}

// === Assignment Rule API ===

export const assignmentRuleApi = {
  list(companyId?: string): Promise<ItemListResponse<AssignmentRule>> {
    const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
    return apiRequest(`/api/assignment-rules${qs}`)
  },
  create(companyId: string, category: string, targetGroupId: string): Promise<AssignmentRule> {
    return apiRequest('/api/assignment-rules', { method: 'POST', body: JSON.stringify({ companyId, category, targetGroupId }) })
  },
}
