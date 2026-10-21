/**
 * 工单系统前后端共享的枚举与分类字典。
 * 取值与中文文案以已批准技术契约为唯一依据（契约 1.1 / 第 9 节）。
 * 本文件保持平台中立：不依赖 Node、Hono、React 或数据库驱动。
 */

export const TICKET_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export const TICKET_STATUSES = ['created', 'pending_assignment', 'pending_processing', 'completed', 'cancelled'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

/** 工单活跃（未结束）状态：创建、待分配、待处理。 */
export const ACTIVE_TICKET_STATUSES: readonly TicketStatus[] = ['created', 'pending_assignment', 'pending_processing']

export interface TicketCategoryOption {
  readonly id: string
  readonly label: string
}

/** 问题分类初始清单（实现期冻结，前后端共享同一常量）。 */
export const TICKET_CATEGORIES: readonly TicketCategoryOption[] = [
  { id: 'account', label: '账号问题' },
  { id: 'payment', label: '支付问题' },
  { id: 'performance', label: '性能问题' },
  { id: 'bug', label: '功能缺陷' },
  { id: 'feature', label: '功能建议' },
  { id: 'other', label: '其他' },
]

const TICKET_CATEGORY_IDS: readonly string[] = TICKET_CATEGORIES.map((option) => option.id)

/** 状态中文文案（契约第 9 节映射）。 */
export const TICKET_STATUS_LABELS: Readonly<Record<TicketStatus, string>> = {
  created: '创建',
  pending_assignment: '待分配',
  pending_processing: '待处理',
  completed: '完成',
  cancelled: '取消',
}

/** 分类中文文案。 */
export const TICKET_CATEGORY_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  TICKET_CATEGORIES.map((option) => [option.id, option.label]),
)

export function isTicketPriority(value: unknown): value is TicketPriority {
  return typeof value === 'string' && (TICKET_PRIORITIES as readonly string[]).includes(value)
}

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && (TICKET_STATUSES as readonly string[]).includes(value)
}

export function isTicketCategory(value: unknown): boolean {
  return typeof value === 'string' && TICKET_CATEGORY_IDS.includes(value)
}

/** 满意度评分：1-5 整数（契约 1.1）。 */
export function isTicketRatingScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
}
