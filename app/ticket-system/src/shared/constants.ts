export const TICKET_STATUS = {
  CREATED: 'created',
  PENDING_ASSIGNMENT: 'pending_assignment',
  PENDING_PROCESSING: 'pending_processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const
export type TicketStatus = typeof TICKET_STATUS[keyof typeof TICKET_STATUS]

export const TICKET_STATUSES: readonly TicketStatus[] = [
  TICKET_STATUS.CREATED,
  TICKET_STATUS.PENDING_ASSIGNMENT,
  TICKET_STATUS.PENDING_PROCESSING,
  TICKET_STATUS.COMPLETED,
  TICKET_STATUS.CANCELLED,
]

export const TICKET_PRIORITY = {
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
} as const
export type TicketPriority = typeof TICKET_PRIORITY[keyof typeof TICKET_PRIORITY]

export const TICKET_PRIORITIES: readonly TicketPriority[] = [
  TICKET_PRIORITY.P0,
  TICKET_PRIORITY.P1,
  TICKET_PRIORITY.P2,
  TICKET_PRIORITY.P3,
  TICKET_PRIORITY.P4,
]

export const AUDIT_EVENT_TYPE = {
  TICKET_CREATED: 'ticket.created',
  TICKET_ASSIGNED: 'ticket.assigned',
  TICKET_TRANSFERRED: 'ticket.transferred',
  TICKET_REPLIED: 'ticket.replied',
  TICKET_COMPLETED: 'ticket.completed',
  TICKET_CANCELLED: 'ticket.cancelled',
} as const
export type AuditEventType = typeof AUDIT_EVENT_TYPE[keyof typeof AUDIT_EVENT_TYPE]

export const PERMISSION_KEYS = {
  TICKET_CREATE: 'ticket.create',
  TICKET_READ: 'ticket.read',
  TICKET_REPLY: 'ticket.reply',
  TICKET_TRANSFER: 'ticket.transfer',
  TICKET_COMPLETE: 'ticket.complete',
  TICKET_CANCEL: 'ticket.cancel',
  TICKET_EVALUATE: 'ticket.evaluate',
  BUSINESS_GROUP_MANAGE: 'business_group.manage',
  ROUTING_RULE_MANAGE: 'routing_rule.manage',
  USER_MANAGE: 'user.manage',
  STATS_READ: 'stats.read',
} as const

export const ROLE_KEYS = {
  TICKET_SUBMITTER: 'ticket_submitter',
  TICKET_HANDLER: 'ticket_handler',
  BUSINESS_GROUP_ADMIN: 'business_group_admin',
  ADMIN: 'admin',
} as const

export type PermissionRegistry = {
  permissions: Readonly<Record<string, { key: string; description?: string }>>
  roles: Readonly<Record<string, readonly string[]>>
}

const perm = (key: string, description: string) => ({ key, description })

export const permissionRegistry: PermissionRegistry = {
  permissions: {
    [PERMISSION_KEYS.TICKET_CREATE]: perm(PERMISSION_KEYS.TICKET_CREATE, 'Create tickets'),
    [PERMISSION_KEYS.TICKET_READ]: perm(PERMISSION_KEYS.TICKET_READ, 'Read tickets'),
    [PERMISSION_KEYS.TICKET_REPLY]: perm(PERMISSION_KEYS.TICKET_REPLY, 'Reply to tickets'),
    [PERMISSION_KEYS.TICKET_TRANSFER]: perm(PERMISSION_KEYS.TICKET_TRANSFER, 'Transfer tickets'),
    [PERMISSION_KEYS.TICKET_COMPLETE]: perm(PERMISSION_KEYS.TICKET_COMPLETE, 'Complete tickets'),
    [PERMISSION_KEYS.TICKET_CANCEL]: perm(PERMISSION_KEYS.TICKET_CANCEL, 'Cancel tickets'),
    [PERMISSION_KEYS.TICKET_EVALUATE]: perm(PERMISSION_KEYS.TICKET_EVALUATE, 'Evaluate completed tickets'),
    [PERMISSION_KEYS.BUSINESS_GROUP_MANAGE]: perm(PERMISSION_KEYS.BUSINESS_GROUP_MANAGE, 'Manage business groups and members'),
    [PERMISSION_KEYS.ROUTING_RULE_MANAGE]: perm(PERMISSION_KEYS.ROUTING_RULE_MANAGE, 'Manage category routing rules'),
    [PERMISSION_KEYS.USER_MANAGE]: perm(PERMISSION_KEYS.USER_MANAGE, 'Manage users'),
    [PERMISSION_KEYS.STATS_READ]: perm(PERMISSION_KEYS.STATS_READ, 'Read statistics'),
  },
  roles: {
    [ROLE_KEYS.TICKET_SUBMITTER]: [
      PERMISSION_KEYS.TICKET_CREATE,
      PERMISSION_KEYS.TICKET_READ,
      PERMISSION_KEYS.TICKET_REPLY,
      PERMISSION_KEYS.TICKET_CANCEL,
      PERMISSION_KEYS.TICKET_EVALUATE,
      PERMISSION_KEYS.STATS_READ,
    ],
    [ROLE_KEYS.TICKET_HANDLER]: [
      PERMISSION_KEYS.TICKET_CREATE,
      PERMISSION_KEYS.TICKET_READ,
      PERMISSION_KEYS.TICKET_REPLY,
      PERMISSION_KEYS.TICKET_TRANSFER,
      PERMISSION_KEYS.TICKET_COMPLETE,
      PERMISSION_KEYS.TICKET_CANCEL,
      PERMISSION_KEYS.STATS_READ,
    ],
    [ROLE_KEYS.BUSINESS_GROUP_ADMIN]: [
      PERMISSION_KEYS.TICKET_CREATE,
      PERMISSION_KEYS.TICKET_READ,
      PERMISSION_KEYS.TICKET_REPLY,
      PERMISSION_KEYS.TICKET_TRANSFER,
      PERMISSION_KEYS.TICKET_COMPLETE,
      PERMISSION_KEYS.TICKET_CANCEL,
      PERMISSION_KEYS.BUSINESS_GROUP_MANAGE,
      PERMISSION_KEYS.ROUTING_RULE_MANAGE,
      PERMISSION_KEYS.USER_MANAGE,
      PERMISSION_KEYS.STATS_READ,
    ],
    [ROLE_KEYS.ADMIN]: [
      PERMISSION_KEYS.TICKET_CREATE,
      PERMISSION_KEYS.TICKET_READ,
      PERMISSION_KEYS.TICKET_REPLY,
      PERMISSION_KEYS.TICKET_TRANSFER,
      PERMISSION_KEYS.TICKET_COMPLETE,
      PERMISSION_KEYS.TICKET_CANCEL,
      PERMISSION_KEYS.TICKET_EVALUATE,
      PERMISSION_KEYS.BUSINESS_GROUP_MANAGE,
      PERMISSION_KEYS.ROUTING_RULE_MANAGE,
      PERMISSION_KEYS.USER_MANAGE,
      PERMISSION_KEYS.STATS_READ,
    ],
  },
}
