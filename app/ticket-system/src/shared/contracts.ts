// 工单系统跨端共享契约：枚举、权限键、角色映射、审计动作与接口 DTO。
// 本文件保持平台中立：不依赖 Node、Hono、React、DOM 或数据库驱动。
// 字段、枚举、错误码与权限键以 docs/wi-t1000006/technical-contract.md 为唯一来源。

export const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export type Priority = (typeof PRIORITIES)[number]

export const TICKET_STATUSES = ['created', 'pending_assignment', 'pending_processing', 'completed', 'cancelled'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const ROLE_CODES = ['submitter', 'agent', 'configurator', 'manager'] as const
export type RoleCode = (typeof ROLE_CODES)[number]

/** 可见公司内全部工单的角色；仅持 submitter 的用户只能处理自己提交的工单。 */
export const COMPANY_WIDE_ROLES: readonly RoleCode[] = ['agent', 'configurator', 'manager']

export const NOTIFICATION_STATUSES = ['success', 'failed'] as const
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number]

export const NOTIFICATION_CHANNEL = 'email'

export const ASSIGNMENT_KINDS = ['auto', 'assign', 'transfer'] as const
export type AssignmentKind = (typeof ASSIGNMENT_KINDS)[number]

export const ERROR_CODES = {
  INVALID_REQUEST: 'invalid_request',
  UNAUTHENTICATED: 'unauthenticated',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  STATE_VIOLATION: 'state_violation',
  INTERNAL_ERROR: 'internal_error',
} as const
export type ApiErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export const PERMISSIONS = {
  TICKET_CREATE: 'ticket:create',
  TICKET_READ: 'ticket:read',
  TICKET_REPLY: 'ticket:reply',
  TICKET_ASSIGN: 'ticket:assign',
  TICKET_TRANSFER: 'ticket:transfer',
  TICKET_COMPLETE: 'ticket:complete',
  TICKET_CANCEL: 'ticket:cancel',
  TICKET_RATE: 'ticket:rate',
  ORG_READ: 'org:read',
  ORG_CONFIGURE: 'org:configure',
  ANALYTICS_READ: 'analytics:read',
  AUDIT_READ: 'audit:read',
} as const
export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const PERMISSION_KEYS: readonly PermissionKey[] = Object.values(PERMISSIONS)

/** 角色到权限的推荐基线映射（技术契约第 6 节）。 */
export const ROLE_PERMISSIONS: Readonly<Record<RoleCode, readonly PermissionKey[]>> = {
  submitter: [PERMISSIONS.TICKET_CREATE, PERMISSIONS.TICKET_READ, PERMISSIONS.TICKET_REPLY, PERMISSIONS.TICKET_CANCEL, PERMISSIONS.TICKET_RATE],
  agent: [PERMISSIONS.TICKET_CREATE, PERMISSIONS.TICKET_READ, PERMISSIONS.TICKET_REPLY, PERMISSIONS.TICKET_ASSIGN, PERMISSIONS.TICKET_TRANSFER, PERMISSIONS.TICKET_COMPLETE, PERMISSIONS.TICKET_CANCEL, PERMISSIONS.ORG_READ],
  configurator: [PERMISSIONS.TICKET_CREATE, PERMISSIONS.TICKET_READ, PERMISSIONS.TICKET_REPLY, PERMISSIONS.TICKET_CANCEL, PERMISSIONS.ORG_READ, PERMISSIONS.ORG_CONFIGURE, PERMISSIONS.AUDIT_READ],
  manager: [PERMISSIONS.TICKET_CREATE, PERMISSIONS.TICKET_READ, PERMISSIONS.TICKET_REPLY, PERMISSIONS.TICKET_ASSIGN, PERMISSIONS.TICKET_TRANSFER, PERMISSIONS.TICKET_COMPLETE, PERMISSIONS.TICKET_CANCEL, PERMISSIONS.ORG_READ, PERMISSIONS.ORG_CONFIGURE, PERMISSIONS.ANALYTICS_READ, PERMISSIONS.AUDIT_READ],
}

export const AUDIT_ACTIONS = {
  TICKET_CREATED: 'ticket.created',
  TICKET_AUTO_ASSIGNED: 'ticket.auto_assigned',
  TICKET_ASSIGNED: 'ticket.assigned',
  TICKET_TRANSFERRED: 'ticket.transferred',
  TICKET_REPLIED: 'ticket.replied',
  TICKET_COMPLETED: 'ticket.completed',
  TICKET_CANCELLED: 'ticket.cancelled',
  TICKET_RATED: 'ticket.rated',
  TICKET_COMPLETION_NOTIFIED: 'ticket.completion_notified',
  GROUP_CREATED: 'org.group_created',
  GROUP_UPDATED: 'org.group_updated',
  GROUP_MEMBERS_UPDATED: 'org.group_members_updated',
  ASSIGNMENT_RULE_CREATED: 'org.assignment_rule_created',
  ASSIGNMENT_RULE_UPDATED: 'org.assignment_rule_updated',
  ASSIGNMENT_RULE_DELETED: 'org.assignment_rule_deleted',
} as const
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]

export const AUDIT_OBJECT_TYPES = {
  TICKET: 'ticket',
  BUSINESS_GROUP: 'business_group',
  ASSIGNMENT_RULE: 'assignment_rule',
} as const

/** 系统触发（自动分配、完成通知）使用的固定操作人标识。 */
export const SYSTEM_ACTOR = 'system'

export type TicketSubmitter = {
  memberId: string
  name: string
  companyId: string
  companyName: string
  departmentId: string | null
  departmentName: string | null
  email: string
}

export type SubmitterHistoryItem = {
  id: string
  ticketNo: string
  subject: string
  category: string
  status: TicketStatus
  priority: Priority
  createdAt: string
}

export type TicketReply = {
  id: string
  authorMemberId: string
  authorName: string
  authorRole: string
  content: string
  createdAt: string
}

export type TicketAssignment = {
  id: string
  kind: AssignmentKind
  fromMemberName: string | null
  toMemberName: string | null
  toGroupName: string | null
  actorName: string | null
  createdAt: string
}

export type TicketRating = { score: number; comment: string | null; createdAt: string }

export type TicketNotification = {
  id: string
  channel: string
  recipientEmail: string
  status: NotificationStatus
  error: string | null
  createdAt: string
  sentAt: string | null
}

export type Ticket = {
  id: string
  ticketNo: string
  subject: string
  description: string
  category: string
  priority: Priority
  status: TicketStatus
  groupId: string | null
  groupName: string | null
  assigneeMemberId: string | null
  assigneeName: string | null
  createdAt: string
  completedAt: string | null
  completedByName: string | null
  cancelledAt: string | null
  submitter: TicketSubmitter
  submitterHistory: SubmitterHistoryItem[]
  replies: TicketReply[]
  assignments: TicketAssignment[]
  rating: TicketRating | null
  notifications: TicketNotification[]
}

export type TicketSummary = {
  id: string
  ticketNo: string
  subject: string
  category: string
  priority: Priority
  status: TicketStatus
  groupId: string | null
  groupName: string | null
  assigneeMemberId: string | null
  assigneeName: string | null
  submitterName: string
  createdAt: string
  completedAt: string | null
}

export type Page<TItem> = { items: TItem[]; total: number; page: number; pageSize: number }

export type MeContext = {
  userId: string
  memberId: string
  displayName: string
  email: string
  companyId: string
  companyName: string
  departmentId: string | null
  departmentName: string | null
  roles: RoleCode[]
  permissions: PermissionKey[]
}

export type BusinessGroupMember = { memberId: string; displayName: string }

export type BusinessGroup = {
  id: string
  name: string
  description: string | null
  members: BusinessGroupMember[]
  createdAt: string
  updatedAt: string
}

export type BusinessGroupSummary = {
  id: string
  name: string
  description: string | null
  memberCount: number
  memberIds: string[]
  members: BusinessGroupMember[]
  createdAt: string
  updatedAt: string
}

export type AssignmentRule = {
  id: string
  category: string
  groupId: string
  groupName: string
  createdAt: string
  updatedAt: string
}

export type OrgMember = {
  memberId: string
  displayName: string
  email: string
  departmentId: string | null
  departmentName: string | null
  roles: RoleCode[]
}

export type AuditEventRecord = {
  id: string
  action: string
  objectType: string
  objectId: string
  actorMemberId: string
  actorName: string | null
  occurredAt: string
  details: Record<string, unknown>
}

export type DistributionBoundary = 'company' | 'department'

export type DistributionItem = { key: string; name: string; count: number }

export type DistributionResponse = {
  by: DistributionBoundary
  total: number
  items: DistributionItem[]
}

export type SatisfactionSummary = {
  average: number | null
  count: number
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>
}

export type HotCategory = { category: string; count: number }

export type OverviewResponse = {
  ticketCount: number
  statusBreakdown: Record<TicketStatus, number>
  avgFirstResponseSeconds: number | null
  satisfaction: SatisfactionSummary
  hotCategories: HotCategory[]
}
