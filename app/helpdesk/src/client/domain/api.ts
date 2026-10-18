// 契约端点函数：按 technical-contract.md 的 method/path/请求响应实现，不发明 API 行为。
import { apiDownload, apiRequest, apiUpload, jsonInit } from '../platform/api-client'
import type {
  AdminCategory,
  AssignmentRuleRow,
  AssignmentRulesResponse,
  AttachmentUploadResult,
  AuditLog,
  BreakdownRow,
  CategoryBody,
  CategoryOption,
  CompanyBody,
  CompanyImportRow,
  CompanyNode,
  CreateDraftBody,
  DashboardSummary,
  Department,
  DepartmentBody,
  EmbedKanban,
  EmbedSummary,
  Holiday,
  LoginResponse,
  Me,
  Page,
  Priority,
  RatingResponse,
  ReplyResponse,
  SlaPoliciesResponse,
  SlaPolicyBody,
  SubCategoryBody,
  SubmitResult,
  Team,
  TeamBody,
  TeamMember,
  TicketDetail,
  TicketListQuery,
  TicketSummary,
  TimelineItem,
  UpdateDraftBody,
  UserAdminRow,
  UserBody,
  UserImportRow,
  VacationBody,
  WorkCalendar,
} from './types'

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

/** 部分列表接口契约未标注包裹形式（裸数组或 { items }），统一在此兼容 */
async function asItems<T>(promise: Promise<unknown>): Promise<T[]> {
  const response = await promise
  if (Array.isArray(response)) return response as T[]
  if (response && typeof response === 'object' && Array.isArray((response as { items?: unknown }).items)) {
    return (response as { items: T[] }).items
  }
  return []
}

export function ticketListQuery(query: TicketListQuery): string {
  const search = new URLSearchParams()
  if (query.status?.length) search.set('status', query.status.join(','))
  if (query.q) search.set('q', query.q)
  if (query.category) search.set('category', String(query.category))
  if (query.priority) search.set('priority', query.priority)
  if (query.assignee) search.set('assignee', String(query.assignee))
  if (query.requester) search.set('requester', String(query.requester))
  if (query.department) search.set('department', String(query.department))
  if (query.team) search.set('team', String(query.team))
  if (query.sla) search.set('sla', query.sla)
  search.set('page', String(query.page ?? 1))
  search.set('pageSize', String(query.pageSize ?? 20))
  search.set('sort', query.sort ?? 'updated_at:desc')
  return `?${search.toString()}`
}

/** 分页遍历取全量（下拉/树等选择数据用），带安全上限 */
export async function fetchAllPages<T>(fetchPage: (page: number) => Promise<Page<T>>, maxPages = 50): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; page <= maxPages; page++) {
    const result = await fetchPage(page)
    out.push(...result.items)
    if (result.items.length === 0 || out.length >= result.total) break
  }
  return out
}

export const api = {
  // ---- 会话（契约 §2） ----
  login: (email: string, password: string) =>
    apiRequest<LoginResponse>('/api/auth/login', jsonInit('POST', { email, password }, true)),
  logout: () => apiRequest<void>('/api/auth/logout', jsonInit('POST', {})),
  me: () => apiRequest<Me>('/api/auth/me'),

  // ---- 工单（契约 §3） ----
  listTickets: (query: TicketListQuery) => apiRequest<Page<TicketSummary>>(`/api/tickets${ticketListQuery(query)}`),
  getTicket: (id: number) => apiRequest<TicketDetail>(`/api/tickets/${id}`),
  createDraft: (body: CreateDraftBody) => apiRequest<TicketDetail>('/api/tickets', jsonInit('POST', body)),
  updateDraft: (id: number, body: UpdateDraftBody) =>
    apiRequest<TicketDetail>(`/api/tickets/${id}`, jsonInit('PATCH', body)),
  deleteDraft: (id: number) => apiRequest<void>(`/api/tickets/${id}`, { method: 'DELETE' }),
  submitDraft: (id: number, idempotencyKey: string) =>
    apiRequest<SubmitResult>(`/api/tickets/${id}/submit`, jsonInit('POST', { idempotencyKey })),
  reply: (id: number, body: string) =>
    apiRequest<ReplyResponse>(`/api/tickets/${id}/replies`, jsonInit('POST', { body })),
  start: (id: number) => apiRequest<TicketDetail>(`/api/tickets/${id}/start`, jsonInit('POST', {})),
  resolve: (id: number, resolutionNote: string) =>
    apiRequest<TicketDetail>(`/api/tickets/${id}/resolve`, jsonInit('POST', { resolutionNote })),
  confirm: (id: number) => apiRequest<TicketDetail>(`/api/tickets/${id}/confirm`, jsonInit('POST', {})),
  reject: (id: number, reason: string) =>
    apiRequest<TicketDetail>(`/api/tickets/${id}/reject`, jsonInit('POST', { reason })),
  cancel: (id: number, reason: string) =>
    apiRequest<TicketDetail>(`/api/tickets/${id}/cancel`, jsonInit('POST', { reason })),
  hold: (id: number, body: { reason: string; note?: string; expectedResumeAt?: string }) =>
    apiRequest<TicketDetail>(`/api/tickets/${id}/hold`, jsonInit('POST', body)),
  resume: (id: number) => apiRequest<TicketDetail>(`/api/tickets/${id}/resume`, jsonInit('POST', {})),
  assign: (id: number, teamId: number, userId: number) =>
    apiRequest<TicketDetail>(`/api/tickets/${id}/assign`, jsonInit('POST', { teamId, userId })),
  transfer: (id: number, targetDepartmentId: number, targetUserId?: number) =>
    apiRequest<TicketDetail>(`/api/tickets/${id}/transfer`, jsonInit('POST', { targetDepartmentId, targetUserId })),
  changeCategory: (id: number, categoryId: number) =>
    apiRequest<TicketDetail>(`/api/tickets/${id}/category`, jsonInit('PATCH', { categoryId })),
  changePriority: (id: number, priority: Priority) =>
    apiRequest<TicketDetail>(`/api/tickets/${id}/priority`, jsonInit('PATCH', { priority })),
  rate: (id: number, score: number, comment?: string) =>
    apiRequest<RatingResponse>(`/api/tickets/${id}/rating`, jsonInit('POST', { score, comment })),
  timeline: (id: number) => apiRequest<{ items: TimelineItem[] }>(`/api/tickets/${id}/timeline`),
  exportTicketsCsv: (query: TicketListQuery) => apiDownload(`/api/tickets/export.csv${ticketListQuery(query)}`, 'tickets.csv'),

  // ---- 分类（契约 §5） ----
  categoryOptions: () => asItems<CategoryOption>(apiRequest<unknown>('/api/categories/options')),
  adminCategories: (page: number) => apiRequest<Page<AdminCategory>>(`/api/admin/categories${qs({ page, pageSize: 20 })}`),
  createCategory: (body: CategoryBody) => apiRequest<AdminCategory>('/api/admin/categories', jsonInit('POST', body)),
  updateCategory: (id: number, body: Partial<CategoryBody>) =>
    apiRequest<AdminCategory>(`/api/admin/categories/${id}`, jsonInit('PATCH', body)),
  createSubCategory: (body: SubCategoryBody) => apiRequest<unknown>('/api/admin/subcategories', jsonInit('POST', body)),
  updateSubCategory: (id: number, body: Partial<SubCategoryBody>) =>
    apiRequest<unknown>(`/api/admin/subcategories/${id}`, jsonInit('PATCH', body)),

  // ---- 分配规则（契约 §5） ----
  assignmentRules: (q?: string) =>
    apiRequest<AssignmentRulesResponse>(`/api/admin/assignment-rules${qs({ q })}`),
  createRule: (categoryId: number, teamIds: number[]) =>
    apiRequest<unknown>('/api/admin/assignment-rules', jsonInit('POST', { categoryId, teamIds })),
  updateRule: (id: number, teamIds: number[]) =>
    apiRequest<unknown>(`/api/admin/assignment-rules/${id}`, jsonInit('PATCH', { teamIds })),
  deleteRule: (id: number) => apiRequest<unknown>(`/api/admin/assignment-rules/${id}`, { method: 'DELETE' }),
  exportRulesCsv: () => apiDownload('/api/admin/assignment-rules/export.csv', 'assignment-rules.csv'),
  importRules: (rows: AssignmentRuleRow[]) =>
    apiRequest<unknown>('/api/admin/assignment-rules/import', jsonInit('POST', { rows })),

  // ---- SLA / 日历 / 节假日（契约 §6） ----
  slaPolicies: () => apiRequest<SlaPoliciesResponse>('/api/admin/sla-policies'),
  createSlaPolicy: (body: SlaPolicyBody) => apiRequest<unknown>('/api/admin/sla-policies', jsonInit('POST', body)),
  updateSlaPolicy: (id: number, body: Partial<SlaPolicyBody>) =>
    apiRequest<unknown>(`/api/admin/sla-policies/${id}`, jsonInit('PATCH', body)),
  getCalendar: () => apiRequest<WorkCalendar>('/api/admin/calendar'),
  putCalendar: (body: WorkCalendar) => apiRequest<WorkCalendar>('/api/admin/calendar', jsonInit('PUT', body)),
  holidays: () => asItems<Holiday>(apiRequest<unknown>('/api/admin/holidays')),
  createHoliday: (body: { date: string; nameZh: string; nameEn: string }) =>
    apiRequest<Holiday>('/api/admin/holidays', jsonInit('POST', body)),
  deleteHoliday: (id: number) => apiRequest<unknown>(`/api/admin/holidays/${id}`, { method: 'DELETE' }),

  // ---- 组织与用户（契约 §4） ----
  departments: (page: number) => apiRequest<Page<Department>>(`/api/org/departments${qs({ page, pageSize: 20 })}`),
  createDepartment: (body: DepartmentBody) => apiRequest<Department>('/api/org/departments', jsonInit('POST', body)),
  updateDepartment: (id: number, body: Partial<DepartmentBody>) =>
    apiRequest<Department>(`/api/org/departments/${id}`, jsonInit('PATCH', body)),
  departmentTeams: (departmentId: number) =>
    asItems<Team>(apiRequest<unknown>(`/api/org/departments/${departmentId}/teams`)),
  createTeam: (body: TeamBody) => apiRequest<Team>('/api/org/teams', jsonInit('POST', body)),
  updateTeam: (id: number, body: { nameZh?: string; nameEn?: string }) =>
    apiRequest<unknown>(`/api/org/teams/${id}`, jsonInit('PATCH', body)),
  setTeamStatus: (id: number, status: string) =>
    apiRequest<unknown>(`/api/org/teams/${id}/status`, jsonInit('POST', { status })),
  teamMembers: (teamId: number) => asItems<TeamMember>(apiRequest<unknown>(`/api/org/teams/${teamId}/members`)),
  teamCandidates: (teamId: number) =>
    asItems<Me>(apiRequest<unknown>(`/api/org/teams/${teamId}/member-candidates`)),
  addTeamMember: (teamId: number, userId: number) =>
    apiRequest<unknown>(`/api/org/teams/${teamId}/members`, jsonInit('POST', { userId })),
  removeTeamMember: (teamId: number, userId: number) =>
    apiRequest<unknown>(`/api/org/teams/${teamId}/members/${userId}`, { method: 'DELETE' }),
  departmentCandidates: (departmentId: number) =>
    asItems<Me>(apiRequest<unknown>(`/api/org/departments/${departmentId}/member-candidates`)),
  addDepartmentMember: (departmentId: number, userId: number) =>
    apiRequest<unknown>(`/api/org/departments/${departmentId}/members`, jsonInit('POST', { userId })),
  setVacation: (teamId: number, userId: number, body: VacationBody) =>
    apiRequest<unknown>(`/api/org/teams/${teamId}/members/${userId}/vacations`, jsonInit('POST', body)),
  cancelVacation: (teamId: number, userId: number) =>
    apiRequest<unknown>(`/api/org/teams/${teamId}/members/${userId}/vacations`, { method: 'DELETE' }),
  adminUsers: (page: number) => apiRequest<Page<UserAdminRow>>(`/api/admin/users${qs({ page, pageSize: 20 })}`),
  createUser: (body: UserBody) => apiRequest<UserAdminRow>('/api/admin/users', jsonInit('POST', body)),
  updateUser: (id: number, body: Partial<UserBody>) =>
    apiRequest<UserAdminRow>(`/api/admin/users/${id}`, jsonInit('PATCH', body)),
  exportUsersCsv: () => apiDownload('/api/admin/users/export.csv', 'users.csv'),
  importUsers: (rows: UserImportRow[]) => apiRequest<unknown>('/api/admin/users/import', jsonInit('POST', { rows })),
  companies: (q?: string) => asItems<CompanyNode>(apiRequest<unknown>(`/api/org/companies${qs({ q })}`)),
  createCompany: (body: CompanyBody) => apiRequest<CompanyNode>('/api/org/companies', jsonInit('POST', body)),
  updateCompany: (id: number, body: Partial<CompanyBody>) =>
    apiRequest<CompanyNode>(`/api/org/companies/${id}`, jsonInit('PATCH', body)),
  exportCompaniesCsv: () => apiDownload('/api/org/companies/export.csv', 'companies.csv'),
  importCompanies: (rows: CompanyImportRow[]) =>
    apiRequest<unknown>('/api/org/companies/import', jsonInit('POST', { rows })),

  // ---- 审计（契约 §10） ----
  auditLogs: (page: number) => apiRequest<Page<AuditLog>>(`/api/admin/audit-logs${qs({ page, pageSize: 20 })}`),

  // ---- Dashboard（契约 §8） ----
  dashboardSummary: () => apiRequest<DashboardSummary>('/api/dashboard/summary'),
  dashboardBreakdown: (dimension: 'category' | 'priority' | 'department') =>
    asItems<BreakdownRow>(apiRequest<unknown>(`/api/dashboard/breakdown?dimension=${dimension}`)),

  // ---- 嵌入式工作台（契约 §11） ----
  embedSummary: () => apiRequest<EmbedSummary>('/api/embed/summary'),
  embedKanban: () => apiRequest<EmbedKanban>('/api/embed/kanban'),

  // ---- 附件（契约 §12） ----
  uploadAttachment: (file: File, ticketId?: number) => {
    const form = new FormData()
    form.append('file', file)
    if (ticketId !== undefined) form.append('ticketId', String(ticketId))
    return apiUpload<AttachmentUploadResult>('/api/attachments', form)
  },
  downloadAttachment: (id: number, fileName: string) => apiDownload(`/api/attachments/${id}/download`, fileName),
}
