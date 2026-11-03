export const TicketStatus = {
  CREATED: 'created',
  PENDING_ASSIGNMENT: 'pending_assignment',
  PENDING_PROCESSING: 'pending_processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const

export type TicketStatusValue = typeof TicketStatus[keyof typeof TicketStatus]

export const TicketPriority = {
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
} as const

export type TicketPriorityValue = typeof TicketPriority[keyof typeof TicketPriority]

export const Role = {
  SUBMITTER: 'submitter',
  HANDLER: 'handler',
  ADMIN: 'admin',
} as const

export type RoleValue = typeof Role[keyof typeof Role]

export const AuditAction = {
  TICKET_CREATED: 'ticket_created',
  TICKET_ASSIGNED: 'ticket_assigned',
  TICKET_TRANSFERRED: 'ticket_transferred',
  TICKET_PROCESSED: 'ticket_processed',
  TICKET_COMPLETED: 'ticket_completed',
  TICKET_CANCELLED: 'ticket_cancelled',
} as const

export const ErrorCode = {
  VALIDATION_ERROR: 'validation_error',
  INVALID_TRANSITION: 'invalid_transition',
  ALREADY_EVALUATED: 'already_evaluated',
  ALREADY_MEMBER: 'already_member',
  DUPLICATE_RULE: 'duplicate_rule',
  INVALID_TARGET_GROUP: 'invalid_target_group',
  INVALID_CREDENTIALS: 'invalid_credentials',
  UNAUTHORIZED: 'unauthorized',
  COMPANY_ISOLATION: 'company_isolation',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  NOT_EVALUATED: 'not_evaluated',
  INTERNAL_ERROR: 'internal_error',
} as const

export const VALID_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export const VALID_STATUSES = ['created', 'pending_assignment', 'pending_processing', 'completed', 'cancelled'] as const
export const SORTABLE_FIELDS = ['created_at', 'priority', 'status'] as const
