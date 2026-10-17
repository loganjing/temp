import type { EventType, Priority, TicketStatus } from '../api/types';

/** 工单状态 → 中文标签（契约：中文标签映射由前端完成）。 */
export const STATUS_LABELS: Record<TicketStatus, string> = {
  created: '创建',
  pending_assignment: '待分配',
  processing: '待处理',
  completed: '完成',
  cancelled: '取消',
};

export function statusLabel(status: TicketStatus): string {
  return STATUS_LABELS[status];
}

/** 优先级 → 中文语义标签。 */
export const PRIORITY_LABELS: Record<Priority, string> = {
  P0: '紧急',
  P1: '高',
  P2: '中',
  P3: '低',
  P4: '最低',
};

export function priorityLabel(priority: Priority): string {
  return PRIORITY_LABELS[priority];
}

/** 事件类型 → 中文标签。 */
export const EVENT_LABELS: Record<EventType, string> = {
  created: '创建工单',
  dispatched: '进入分配',
  assigned: '指派',
  reassigned: '转派',
  completed: '完成处理',
  cancelled: '取消工单',
  rated: '满意度评价',
};

export function eventLabel(type: EventType): string {
  return EVENT_LABELS[type];
}
