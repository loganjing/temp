import { apiRequest } from '../platform/api-client'

// ── Domain Types (from technical-contract.md) ──

export type TicketStatus = 'created' | 'pending_assign' | 'pending_handle' | 'completed' | 'cancelled'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type WorkbenchSort = 'created_asc' | 'created_desc' | 'priority'
export type DistributionDimension = 'company' | 'department'

export interface CurrentUser {
  id: string
  name: string
  email: string
  companyId?: string
  department?: string | null
  role?: string
  roles?: string[]
  phone?: string | null
  passwordChangeRequired?: boolean
}

export interface Ticket {
  id: string
  companyId: string
  subject: string
  description: string
  category: string
  priority: string
  status: string
  submitterId: string
  businessGroupId: string | null
  handlerId: string | null
  createdAt: string
  updatedAt: string
  handledAt: string | null
  completedAt: string | null
}

export interface TicketReply {
  id: string
  ticketId?: string
  replierId: string
  replierName: string
  content: string
  createdAt: string
}

export interface TicketDetail extends Ticket {
  replies: TicketReply[]
}

export interface WorkbenchTicket {
  id: string
  subject: string
  category: string
  priority: string
  status: string
  submitterName: string
  handlerName: string | null
  createdAt: string
}

export interface SubmitterInfo {
  id: string
  name: string
  email: string
  companyId: string
  companyName: string
  department: string | null
  historyTickets: {
    id: string
    subject: string
    status: string
    priority: string
    createdAt: string
  }[]
}

export interface BusinessGroupMember {
  id: string
  name: string
  email: string
}

export interface BusinessGroup {
  id: string
  companyId: string
  name: string
  members: BusinessGroupMember[]
  createdAt: string
}

export interface AssignmentRule {
  id: string
  companyId: string
  category: string
  businessGroupId: string
  createdAt: string
}

export interface TicketEvaluation {
  id: string
  ticketId: string
  rating: number
  comment: string | null
  createdAt: string
}

export interface DistributionItem {
  key: string
  label: string
  count: number
}

export interface DistributionResponse {
  dimension: string
  items: DistributionItem[]
}

export interface DashboardData {
  ticketCount: number
  avgResponseTime: number
  satisfactionRate: number
  hotCategories: { category: string; count: number }[]
}

export interface AuditLogEntry {
  id: string
  action: string
  actorId: string
  actorName: string
  details: string | null
  createdAt: string
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface AdminUser {
  id: string
  name: string
  email: string
  phone: string | null
  enabled: boolean
}

// ── Query param builders ──

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  return entries.length ? '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') : ''
}

// ── API surface ──

export const ticketApi = {
  // Workbench
  getWorkbenchTickets(params: {
    search?: string
    status?: string
    priority?: string
    category?: string
    companyId?: string
    sort?: WorkbenchSort
    page?: number
    pageSize?: number
  }): Promise<Paginated<WorkbenchTicket>> {
    return apiRequest<WorkbenchTicket[]>(`/api/workbench/tickets${buildQuery(params)}`).then(r => r as unknown as Paginated<WorkbenchTicket>)
  },

  // Tickets
  getTickets(params: {
    status?: string
    priority?: string
    category?: string
    companyId?: string
    page?: number
    pageSize?: number
  }): Promise<Paginated<Ticket>> {
    return apiRequest<Paginated<Ticket>>(`/api/tickets${buildQuery(params)}`)
  },

  getTicket(id: string): Promise<TicketDetail> {
    return apiRequest<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}`)
  },

  createTicket(body: { subject: string; description: string; category: string; priority: Priority }): Promise<Ticket> {
    return apiRequest<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify(body) })
  },

  cancelTicket(id: string): Promise<Ticket> {
    return apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) })
  },

  addReply(ticketId: string, content: string): Promise<TicketReply> {
    return apiRequest<TicketReply>(`/api/tickets/${encodeURIComponent(ticketId)}/replies`, { method: 'POST', body: JSON.stringify({ content }) })
  },

  // Collaboration
  transferTicket(id: string, toHandlerId: string, reason: string): Promise<Ticket> {
    return apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}/transfer`, { method: 'POST', body: JSON.stringify({ toHandlerId, reason }) })
  },

  // Processing
  getSubmitterInfo(ticketId: string): Promise<SubmitterInfo> {
    return apiRequest<SubmitterInfo>(`/api/tickets/${encodeURIComponent(ticketId)}/submitter`)
  },

  completeTicket(id: string, resolution: string): Promise<Ticket> {
    return apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}/complete`, { method: 'POST', body: JSON.stringify({ resolution }) })
  },

  // Evaluation
  submitEvaluation(ticketId: string, rating: number, comment: string | null): Promise<TicketEvaluation> {
    return apiRequest<TicketEvaluation>(`/api/tickets/${encodeURIComponent(ticketId)}/evaluation`, { method: 'POST', body: JSON.stringify({ rating, comment }) })
  },

  getEvaluation(ticketId: string): Promise<TicketEvaluation | null> {
    return apiRequest<TicketEvaluation>(`/api/tickets/${encodeURIComponent(ticketId)}/evaluation`).catch((err) => {
      if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404) return null
      throw err
    })
  },

  // Business Groups
  getBusinessGroups(): Promise<{ items: BusinessGroup[] }> {
    return apiRequest<{ items: BusinessGroup[] }>('/api/business-groups')
  },

  createBusinessGroup(name: string): Promise<BusinessGroup> {
    return apiRequest<BusinessGroup>('/api/business-groups', { method: 'POST', body: JSON.stringify({ name }) })
  },

  setBusinessGroupMembers(id: string, memberIds: string[]): Promise<BusinessGroup> {
    return apiRequest<BusinessGroup>(`/api/business-groups/${encodeURIComponent(id)}/members`, { method: 'PUT', body: JSON.stringify({ memberIds }) })
  },

  // Assignment Rules
  getAssignmentRules(): Promise<{ items: AssignmentRule[] }> {
    return apiRequest<{ items: AssignmentRule[] }>('/api/assignment-rules')
  },

  createAssignmentRule(category: string, businessGroupId: string): Promise<AssignmentRule> {
    return apiRequest<AssignmentRule>('/api/assignment-rules', { method: 'POST', body: JSON.stringify({ category, businessGroupId }) })
  },

  // Statistics
  getDistribution(dimension: DistributionDimension, companyId?: string): Promise<DistributionResponse> {
    return apiRequest<DistributionResponse>(`/api/statistics/distribution${buildQuery({ dimension, companyId })}`)
  },

  getDashboard(companyId?: string): Promise<DashboardData> {
    return apiRequest<DashboardData>(`/api/statistics/dashboard${buildQuery({ companyId })}`)
  },

  // Audit Logs
  getTicketLogs(ticketId: string): Promise<{ items: AuditLogEntry[] }> {
    return apiRequest<{ items: AuditLogEntry[] }>(`/api/tickets/${encodeURIComponent(ticketId)}/logs`)
  },

  // Admin Users (for transfer target selection)
  getAdminUsers(search?: string): Promise<{ users: AdminUser[]; total: number }> {
    return apiRequest<{ users: AdminUser[]; total: number }>(`/api/admin/users${buildQuery({ search, limit: 100, offset: 0 })}`)
  },
}

// ── Display helpers ──

export const STATUS_LABELS: Record<string, string> = {
  created: '创建',
  pending_assign: '待分配',
  pending_handle: '待处理',
  completed: '完成',
  cancelled: '已取消',
}

export const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 }

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
