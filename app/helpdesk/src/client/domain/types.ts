// 字段级契约类型与枚举（docs/wi-t1000063/technical-contract.md 唯一来源）。
// 仅描述线上形状，不引入契约之外的 API 行为。

export type Role = 'requester' | 'agent' | 'manager' | 'admin'
export type TicketStatus =
  | 'draft'
  | 'pending_assign'
  | 'assigned'
  | 'in_progress'
  | 'on_hold'
  | 'pending_confirm'
  | 'cancelled'
  | 'closed'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type TicketType = 'service_request' | 'incident'
export type SlaState = 'normal' | 'warning' | 'breached' | 'met' | 'missed' | 'paused'
export type ReplyKind = 'normal' | 'resolution' | 'rejection'
export type ActivitySource = 'user' | 'system' | 'mcp'

export const ROLES: Role[] = ['requester', 'agent', 'manager', 'admin']
export const TICKET_STATUSES: TicketStatus[] = [
  'draft',
  'pending_assign',
  'assigned',
  'in_progress',
  'on_hold',
  'pending_confirm',
  'cancelled',
  'closed',
]
export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']
export const TICKET_TYPES: TicketType[] = ['service_request', 'incident']

/** 双语名称引用（服务端序列化时完成缺失回退，前端按语言直接取值） */
export interface Ref {
  id: number
  nameZh: string
  nameEn: string
}

export interface UserRef {
  id: number
  nameZh: string
  nameEn: string
  email: string
  role: Role
  displayName?: string
}

export interface SlaBadge {
  state: SlaState
  text: string
}

export interface TicketSummary {
  id: number
  ticketNo: string | null
  subjectZh: string
  subjectEn: string | null
  category: Ref
  subCategory: Ref | null
  priority: Priority
  status: TicketStatus
  requester: UserRef
  assignee: UserRef | null
  team: Ref | null
  department: Ref | null
  submittedAt: string | null
  firstResponseAt: string | null
  resolvedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
  slaFirstResponse: SlaBadge
  slaResolution: SlaBadge
}

/** 前端入口显隐提示（体验层）；服务端独立强制校验 */
export interface TicketCan {
  editDraft: boolean
  submit: boolean
  reply: boolean
  resolve: boolean
  confirm: boolean
  reject: boolean
  cancel: boolean
  hold: boolean
  resume: boolean
  assign: boolean
  transfer: boolean
  changeCategory: boolean
  changePriority: boolean
  rate: boolean
  deleteDraft: boolean
}

export interface TicketDetail extends TicketSummary {
  description: string
  slaFirstResponseDeadline: string | null
  slaResolutionDeadline: string | null
  can: TicketCan
}

export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export interface Me {
  id: number
  email: string
  role: Role
  nameZh: string
  nameEn: string
  companyId?: number | null
  companyNameZh?: string | null
  companyNameEn?: string | null
}

export interface LoginResponse {
  token: string
  user: UserRef
}

export interface SubmitAssignment {
  result: 'assigned' | 'pending_assign'
  team?: Ref | null
  assignee?: UserRef | null
  fallback?: string | null
  reason?: string | null
}

export interface SubmitResult {
  ticket: TicketDetail
  assignment: SubmitAssignment
  idempotentReplay?: boolean
}

export interface ReplyResponse {
  reply: {
    id: number
    author: UserRef
    body: string
    kind: ReplyKind
    createdAt: string
  }
  ticket: TicketDetail
}

export interface RatingResponse {
  score: number
  comment?: string | null
  createdAt: string
}

export interface TimelineItem {
  kind: 'reply' | 'activity'
  occurredAt: string
  author?: UserRef | null
  body?: string | null
  action?: string | null
  fromStatus?: TicketStatus | null
  toStatus?: TicketStatus | null
  fieldChanges?: { field: string; oldValue: string | null; newValue: string | null }[] | null
  source?: ActivitySource | null
}

export interface TicketListQuery {
  status?: TicketStatus[]
  category?: number
  priority?: Priority
  assignee?: number
  requester?: number
  department?: number
  team?: number
  sla?: 'alert'
  q?: string
  page?: number
  pageSize?: number
  sort?: string
}

export interface CreateDraftBody {
  idempotencyKey: string
  subjectZh: string
  subjectEn?: string
  description: string
  categoryId: number
  subCategoryId?: number
  priority: Priority
  attachmentIds?: number[]
}

export type UpdateDraftBody = Partial<Omit<CreateDraftBody, 'idempotencyKey'>>

export interface SubCategoryOption {
  id: number
  code: string
  nameZh: string
  nameEn: string
  sortOrder?: number
  status?: string
}

export interface CategoryOption {
  id: number
  code: string
  nameZh: string
  nameEn: string
  ticketType: TicketType
  subCategories: SubCategoryOption[]
}

export interface AdminCategory {
  id: number
  code: string
  nameZh: string
  nameEn: string
  department: Ref | null
  ticketType: TicketType
  sortOrder: number
  status: string
}

export interface CategoryBody {
  code: string
  nameZh: string
  nameEn: string
  departmentId?: number
  ticketType: TicketType
  sortOrder: number
  status: string
}

export interface SubCategoryBody {
  code: string
  nameZh: string
  nameEn: string
  categoryId: number
  sortOrder: number
  status: string
}

export interface AssignmentRule {
  id: number
  category: Ref
  department: Ref
  teams: Ref[]
}

export interface AssignmentRulesResponse {
  items: AssignmentRule[]
  unconfiguredCategories: Ref[]
}

export interface AssignmentRuleRow {
  categoryCode: string
  teamCodes: string[]
}

export interface SlaPolicy {
  id: number
  category: Ref
  firstResponseMinutes: number
  resolutionMinutes: number
  warnThresholdPercent?: number | null
}

export interface SlaPoliciesResponse {
  items: SlaPolicy[]
  unconfiguredCategories: Ref[]
}

export interface SlaPolicyBody {
  categoryId: number
  firstResponseMinutes: number
  resolutionMinutes: number
  warnThresholdPercent?: number
}

export interface WorkCalendar {
  weekdays: number[]
  workStartTime: string
  workEndTime: string
  timezone: string
}

export interface Holiday {
  id: number
  date: string
  nameZh: string
  nameEn: string
}

export interface Department {
  id: number
  code: string
  nameZh: string
  nameEn: string
  managers?: UserRef[]
  teamCount?: number
  assignMode?: 'auto' | 'manual'
  status: string
}

export interface DepartmentBody {
  code: string
  nameZh: string
  nameEn: string
  managerIds: number[]
  assignMode?: 'auto' | 'manual'
  status: string
}

export interface Team {
  id: number
  code: string
  nameZh: string
  nameEn: string
  status: string
}

export interface TeamBody {
  departmentId: number
  code: string
  nameZh: string
  nameEn: string
  status: string
}

export interface TeamVacation {
  state: 'on_leave' | 'scheduled'
  startDate: string
  endDate: string
  autoReplyText?: string | null
}

export interface TeamMember {
  user: UserRef
  vacation: TeamVacation | null
}

export interface VacationBody {
  startDate: string
  endDate: string
  autoReplyText?: string
}

export interface UserAdminRow {
  id: number
  email: string
  nameZh: string
  nameEn: string
  phone: string | null
  role: Role
  company: Ref | null
  status: string
}

export interface UserBody {
  email: string
  nameZh: string
  nameEn: string
  phone?: string
  role: Role
  companyId: number
  status: string
  password?: string
}

export interface UserImportRow {
  email: string
  nameZh: string
  nameEn: string
  phone: string
  role: string
  companyCode: string
  status: string
}

export interface CompanyNode {
  id: number
  code: string
  nameZh: string
  nameEn: string
  status: string
  children: CompanyNode[]
}

export interface CompanyBody {
  code: string
  nameZh: string
  nameEn: string
  parentId?: number
  status: string
}

export interface CompanyImportRow {
  code: string
  parentCode: string
  nameZh: string
  nameEn: string
  status: string
}

export interface AuditLog {
  id: number
  category: string
  actor: UserRef | null
  summaryZh: string
  summaryEn: string
  detail: string | null
  createdAt: string
}

export interface DashboardSummary {
  kpis: {
    total: number
    todayCreated: number
    inProgress: number
    onHold: number
    closed: number
  }
  slaAlerts: { count: number }
}

export interface BreakdownRow {
  key: string
  labelZh: string
  labelEn: string
  count: number
}

export interface EmbedSummary {
  kpis: {
    toProcess: number
    inProgress: number
    completed: number
    avgResolutionHours: number
  }
}

export interface EmbedKanban {
  limit: number
  truncated: boolean
  columns: {
    drafts: TicketSummary[]
    teamProcessing: TicketSummary[]
    toConfirm: TicketSummary[]
    done: TicketSummary[]
  }
}

export interface AttachmentUploadResult {
  id: number
  fileName: string
  sizeBytes: number
}
