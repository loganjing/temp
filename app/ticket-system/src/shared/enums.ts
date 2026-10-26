/** 工单状态 */
export const TicketStatus = {
  Created: 'created',
  PendingAssignment: 'pending_assignment',
  PendingProcessing: 'pending_processing',
  Completed: 'completed',
  Cancelled: 'cancelled',
} as const
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus]

/** SLA 优先级 */
export const Priority = {
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
} as const
export type Priority = (typeof Priority)[keyof typeof Priority]

export const VALID_PRIORITIES: readonly Priority[] = [Priority.P0, Priority.P1, Priority.P2, Priority.P3, Priority.P4]

/** 角色 */
export const Role = {
  Submitter: 'submitter',
  Admin: 'admin',
  Processor: 'processor',
} as const
export type Role = (typeof Role)[keyof typeof Role]

/** 审计事件类型 */
export const AuditEventType = {
  TicketCreated: 'ticket_created',
  TicketAssigned: 'ticket_assigned',
  TicketTransferred: 'ticket_transferred',
  TicketCompleted: 'ticket_completed',
  TicketCancelled: 'ticket_cancelled',
} as const
export type AuditEventType = (typeof AuditEventType)[keyof typeof AuditEventType]

/** 满意度评分范围 */
export const MIN_RATING = 1
export const MAX_RATING = 5

/**
 * RBAC 权限注册表：定义三种业务角色及其基础权限集。
 * permissionkit 在启动时 sync 此注册表。
 */
export const PERMISSION_REGISTRY = {
  permissions: {
    'ticket:create': { key: 'ticket:create', description: 'Create tickets' },
    'ticket:read': { key: 'ticket:read', description: 'View company tickets' },
    'ticket:reply': { key: 'ticket:reply', description: 'Reply to tickets' },
    'ticket:transfer': { key: 'ticket:transfer', description: 'Transfer tickets' },
    'ticket:complete': { key: 'ticket:complete', description: 'Complete tickets' },
    'ticket:cancel': { key: 'ticket:cancel', description: 'Cancel tickets' },
    'ticket:rate': { key: 'ticket:rate', description: 'Submit satisfaction rating' },
    'ticket:manage_groups': { key: 'ticket:manage_groups', description: 'Manage business groups and members' },
    'ticket:manage_rules': { key: 'ticket:manage_rules', description: 'Manage assignment rules' },
    'ticket:view_submitter': { key: 'ticket:view_submitter', description: 'View submitter full info' },
    'ticket:view_statistics': { key: 'ticket:view_statistics', description: 'View statistics dashboard' },
    'ticket:view_audit': { key: 'ticket:view_audit', description: 'View audit logs' },
  },
  roles: {
    submitter: ['ticket:create', 'ticket:read', 'ticket:reply', 'ticket:cancel', 'ticket:rate'],
    admin: [
      'ticket:create', 'ticket:read', 'ticket:reply', 'ticket:transfer', 'ticket:complete',
      'ticket:cancel', 'ticket:manage_groups', 'ticket:manage_rules',
      'ticket:view_submitter', 'ticket:view_statistics', 'ticket:view_audit',
    ],
    processor: ['ticket:read', 'ticket:reply', 'ticket:transfer', 'ticket:complete', 'ticket:view_submitter'],
  },
} as const
