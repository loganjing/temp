export const USER_ROLES = ['submitter', 'handler', 'admin', 'ops'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const TICKET_STATUSES = ['unassigned', 'in_progress', 'completed', 'cancelled'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const TICKET_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export const TICKET_SORTS = ['createdAt_desc', 'createdAt_asc', 'priority_asc', 'priority_desc'] as const
export type TicketSort = (typeof TICKET_SORTS)[number]

export const TICKET_EVENT_ACTIONS = [
  'created',
  'assigned',
  'auto_assigned',
  'replied',
  'transferred',
  'priority_changed',
  'completed',
  'cancelled',
  'rated',
  'email_sent',
  'email_skipped',
  'email_failed',
] as const
export type TicketEventAction = (typeof TICKET_EVENT_ACTIONS)[number]

export const NOTIFICATION_STATUSES = ['sent', 'skipped', 'failed'] as const
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number]

export type ApiErrorCode =
  | 'validation_error'
  | 'not_authenticated'
  | 'invalid_credentials'
  | 'account_disabled'
  | 'forbidden'
  | 'not_found'
  | 'invalid_transition'
  | 'ticket_closed'
  | 'already_rated'
  | 'rule_exists'
  | 'duplicate_group'
  | 'group_in_use'
  | 'already_sent'
  | 'rate_limited'
  | 'internal_error'

export type ApiErrorBody = {
  error: { code: ApiErrorCode; message: string; fields?: Record<string, string> }
}

export type TicketCapabilities = {
  canReply: boolean
  canAssign: boolean
  canTransfer: boolean
  canComplete: boolean
  canCancel: boolean
  canRate: boolean
  canChangePriority: boolean
}

export function isTerminalStatus(status: TicketStatus): boolean {
  return status === 'completed' || status === 'cancelled'
}
