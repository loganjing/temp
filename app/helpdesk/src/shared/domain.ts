// Platform-neutral domain contracts shared by server and client.
// Kept free of Node/Hono/React APIs (see app AGENTS.md dependency rules).

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

export type SlaBadge = { state: SlaState; text: string }

export type ReplyKind = 'normal' | 'resolution' | 'rejection'

export type ActivitySource = 'user' | 'system' | 'mcp'

export type Locale = 'zh' | 'en'

export interface UserRef {
  id: number
  nameZh: string
  nameEn: string
  displayName: string
  email: string
  role: Role
}

export interface Ref {
  id: number
  nameZh: string
  nameEn: string
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

export type TicketActions = {
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

export type TicketDetail = TicketSummary & {
  description: string
  slaFirstResponseDeadline: string | null
  slaResolutionDeadline: string | null
  can: TicketActions
}

export type TimelineItem = {
  kind: 'reply' | 'activity'
  occurredAt: string
  author?: UserRef
  body?: string
  replyKind?: ReplyKind
  action?: string
  fromStatus?: TicketStatus | null
  toStatus?: TicketStatus | null
  fieldChanges?: Array<{ field: string; oldValue: string; newValue: string }>
  remarkZh?: string
  remarkEn?: string
  source?: ActivitySource
}

export type ActivityLogItem = {
  id: number
  actor: UserRef | null
  action: string
  fromStatus: TicketStatus | null
  toStatus: TicketStatus | null
  fieldChanges?: Array<{ field: string; oldValue: string; newValue: string }>
  remarkZh: string
  remarkEn: string
  source: ActivitySource
  createdAt: string
}

export type VacationState = 'on_leave' | 'scheduled'

export type VacationInfo = {
  state: VacationState
  startDate: string
  endDate: string
  autoReplyText?: string
}

export type TeamMemberCard = {
  user: UserRef
  vacation: VacationInfo | null
}

export type AssignmentResult =
  | {
      result: 'assigned'
      team?: Ref
      assignee?: UserRef
      fallback?: 'manager'
    }
  | {
      result: 'pending_assign'
      team?: Ref
      reason?: string
    }

export type Paginated<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
}

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

export const ROLES: Role[] = ['requester', 'agent', 'manager', 'admin']

// Statuses that never join the SLA alert scope (contract §7.2).
export const SLA_ALERT_EXCLUDED_STATUSES: TicketStatus[] = [
  'draft',
  'closed',
  'cancelled',
  'on_hold',
  'pending_confirm',
]

// Manager board "team processing" bucket (embed workbench kanban, contract §11).
export const TEAM_PROCESSING_STATUSES: TicketStatus[] = [
  'pending_assign',
  'assigned',
  'in_progress',
  'on_hold',
]

export const DONE_STATUSES: TicketStatus[] = ['closed', 'cancelled']
