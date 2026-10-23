export const TicketStatus = {
  Created: 'created',
  PendingAssign: 'pending_assign',
  PendingHandle: 'pending_handle',
  Completed: 'completed',
  Cancelled: 'cancelled',
} as const
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus]

export const Priority = {
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
} as const
export type Priority = (typeof Priority)[keyof typeof Priority]

export const RoleKey = {
  Submitter: 'submitter',
  Handler: 'handler',
  Admin: 'admin',
} as const
export type RoleKey = (typeof RoleKey)[keyof typeof RoleKey]

export const VALID_PRIORITIES: readonly string[] = Object.values(Priority)
export const VALID_STATUSES: readonly string[] = Object.values(TicketStatus)
