// 共享类型定义，依据 docs/wi-t1000077/technical-contract.md
// 所有 ID 为 TEXT（string），匹配 userkit/authkit/auditkit 平台实现

export type TicketStatus =
  | 'pending_assignment'
  | 'pending_processing'
  | 'completed'
  | 'cancelled'

export type SlaPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export type Role = 'submitter' | 'handler' | 'admin'

export type LogAction =
  | 'ticket_created'
  | 'ticket_assigned'
  | 'ticket_transferred'
  | 'ticket_processed'
  | 'ticket_completed'
  | 'ticket_cancelled'
  | 'ticket_rated'
  | 'ticket_replied'

export const SLA_PRIORITIES: readonly SlaPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export const TICKET_STATUSES: readonly TicketStatus[] = [
  'pending_assignment',
  'pending_processing',
  'completed',
  'cancelled',
]

/** 状态转移规则：当前状态 → 允许转移的目标状态 */
export const VALID_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  pending_assignment: ['pending_processing', 'cancelled'],
  pending_processing: ['pending_assignment', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

/** 判断工单是否可取消（未完成且未取消） */
export function isCancellable(status: TicketStatus): boolean {
  return status === 'pending_assignment' || status === 'pending_processing'
}

/** 判断工单是否可转派（仅待处理/待分配状态） */
export function isTransferable(status: TicketStatus): boolean {
  return status === 'pending_processing' || status === 'pending_assignment'
}
