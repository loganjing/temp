/**
 * API 契约类型定义。
 * 逐字段对照 docs/wi-t1000293/technical-contract.md，不引入契约外字段。
 */

/** 概要引用对象（契约第 1 节：引用对象统一以 {id, name} 概要返回）。 */
export interface Ref {
  id: number;
  name: string;
}

/** 优先级枚举（契约：P0–P4）。 */
export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

/** 工单状态枚举（契约：created | pending_assignment | processing | completed | cancelled）。 */
export type TicketStatus =
  | 'created'
  | 'pending_assignment'
  | 'processing'
  | 'completed'
  | 'cancelled';

/** 工单事件类型枚举（契约第 1 节）。 */
export type EventType =
  | 'created'
  | 'dispatched'
  | 'assigned'
  | 'reassigned'
  | 'completed'
  | 'cancelled'
  | 'rated';

/** 用户对象（契约 2.1）。 */
export interface User {
  id: number;
  name: string;
  email: string;
  company: Ref;
  department: string;
  isCompanyAdmin: boolean;
}

/** 业务组对象（契约 2.4）。 */
export interface BusinessGroup {
  id: number;
  companyId: number;
  name: string;
  members: User[];
}

/** 问题分类（契约 2.7）。 */
export interface Category {
  id: number;
  name: string;
}

/** 公司「分类→业务组」分配规则（契约 2.5 / 2.6）。 */
export interface AssignmentRule {
  id: number;
  category: Ref;
  group: Ref;
}

/** 满意度评价（契约 3.12 / Ticket.rating）。 */
export interface Rating {
  score: number;
  comment: string | null;
  createdAt: string;
}

/** 工单回复（契约 3.3 Reply）。 */
export interface Reply {
  id: number;
  author: Ref;
  content: string;
  createdAt: string;
}

/** assigned / reassigned 事件的 detail（契约 3.3）。 */
export interface AssignmentEventDetail {
  group: Ref;
  assignee: Ref | null;
  previousAssignee: Ref | null;
}

/** cancelled 事件的 detail（契约 3.3）。 */
export interface CancelledEventDetail {
  reason: string | null;
}

/** 事件 detail（契约 3.3：assigned/reassigned 与 cancelled 之外的类型为 {}）。 */
export type EventDetail =
  | AssignmentEventDetail
  | CancelledEventDetail
  | Record<string, never>;

/** 工单事件（契约 3.3 Event）。 */
export interface TicketEvent {
  id: number;
  type: EventType;
  actor: Ref;
  detail: EventDetail;
  createdAt: string;
}

/** 工单（契约 3.1：列表与详情共用；详情额外包含 replies 与 events）。 */
export interface Ticket {
  id: number;
  ticketNo: string;
  subject: string;
  description: string;
  category: Ref;
  priority: Priority;
  status: TicketStatus;
  submitter: User;
  assignedGroup: Ref | null;
  assignee: Ref | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completedBy: Ref | null;
  replyCount: number;
  rating: Rating | null;
}

/** 工单详情（契约 3.3：Ticket + replies + events）。 */
export interface TicketDetail extends Ticket {
  replies: Reply[];
  events: TicketEvent[];
}

/** 工单列表查询参数（契约 3.4，多条件 AND）。 */
export interface TicketListParams {
  status?: TicketStatus;
  categoryId?: number;
  companyId?: number;
  submitterId?: number;
}

/** 创建工单请求体（契约 3.2）。 */
export interface CreateTicketBody {
  subject: string;
  description?: string;
  categoryId: number;
  priority: Priority;
}

/** 指派 / 转派请求体（契约 3.7 / 3.9）。 */
export interface AssignTicketBody {
  groupId: number;
  assigneeId?: number;
}

/** 事件 detail 类型守卫：assigned / reassigned。 */
export function isAssignmentEventDetail(detail: EventDetail): detail is AssignmentEventDetail {
  return typeof detail === 'object' && detail !== null && 'group' in detail;
}

/** 事件 detail 类型守卫：cancelled。 */
export function isCancelledEventDetail(detail: EventDetail): detail is CancelledEventDetail {
  return typeof detail === 'object' && detail !== null && 'reason' in detail;
}
