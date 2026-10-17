// 工单管理系统跨端契约类型与枚举。
// 唯一来源：docs/wi-t1000058/technical-contract.md；server 与 client 共用。
// 平台中性：禁止依赖 Node/Hono/React/DOM/数据库驱动。

export const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export type Priority = (typeof PRIORITIES)[number]

export const TICKET_STATUSES = ['created', 'pending_assignment', 'pending_handling', 'completed', 'cancelled'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const API_ERROR_CODES = ['VALIDATION_ERROR', 'NOT_FOUND', 'INVALID_STATE', 'CONFLICT', 'INTERNAL_ERROR'] as const
export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string }
}

export interface Company {
  id: string
  name: string
}

export interface User {
  id: string
  name: string
  email: string
  companyId: string
  department: string | null
}

export interface BusinessGroup {
  id: string
  companyId: string
  name: string
  memberIds: string[]
}

export interface AssignmentRule {
  id: string
  companyId: string
  category: string
  groupId: string
  createdAt: string
}

export interface AssignmentRuleView {
  id: string
  category: string
  groupId: string
  groupName: string
}

export interface SubmitterInfo {
  name: string
  email: string
  department: string | null
}

export interface Ticket {
  id: string
  subject: string
  description: string
  category: string
  priority: Priority
  status: TicketStatus
  submitter: User
  assignedGroupId: string | null
  createdAt: string
  handlerId: string | null
  handledAt: string | null
  cancelledAt: string | null
}

export interface TicketListItem {
  id: string
  subject: string
  status: TicketStatus
  priority: Priority
  category: string
  submitterName: string
  assignedGroupId: string | null
  createdAt: string
}

export interface TicketHistoryItem {
  id: string
  subject: string
  status: TicketStatus
  priority: Priority
  createdAt: string
}

export interface TicketReply {
  id: string
  authorId: string
  authorName: string
  content: string
  createdAt: string
}

export interface TicketTransfer {
  id: string
  ticketId: string
  fromGroupId: string | null
  toGroupId: string | null
  toUserId: string | null
  operatorId: string
  note: string | null
  createdAt: string
}

export interface TicketEvaluation {
  id: string
  ticketId: string
  rating: number
  comment: string | null
  createdAt: string
  updatedAt: string
}

// ---- 请求体 ----

export interface CreateUserRequest {
  name: string
  email: string
  companyId: string
  department?: string | null
}

export interface CreateGroupRequest {
  name: string
}

export interface SetGroupMembersRequest {
  userIds: string[]
}

export interface CreateAssignmentRuleRequest {
  category: string
  groupId: string
}

export interface CreateTicketRequest {
  operatorId: string
  subject: string
  description: string
  category: string
  priority: Priority
  submitter: SubmitterInfo
}

export interface CreateReplyRequest {
  operatorId: string
  content: string
}

export interface AssignTicketRequest {
  operatorId: string
  groupId: string
}

export interface TransferTicketRequest {
  operatorId: string
  toGroupId?: string | null
  toUserId?: string | null
  note?: string | null
}

export interface CompleteTicketRequest {
  operatorId: string
}

export interface CancelTicketRequest {
  operatorId: string
  note?: string | null
}

export interface SubmitEvaluationRequest {
  operatorId: string
  rating: number
  comment?: string | null
}

// ---- 响应体 ----

export interface BootstrapResponse {
  companies: Company[]
  users: User[]
  groups: BusinessGroup[]
}

export interface CreateUserResponse extends User {
  createdAt: string
}

export interface UserTicketsResponse {
  tickets: TicketHistoryItem[]
}

export interface CompanyGroupsResponse {
  groups: Array<{ id: string; name: string; memberIds: string[] }>
}

export interface CreateGroupResponse {
  id: string
  companyId: string
  name: string
  memberIds: string[]
  createdAt: string
}

export interface SetGroupMembersResponse {
  id: string
  memberIds: string[]
}

export interface AssignmentRulesResponse {
  rules: AssignmentRuleView[]
}

export interface CreateAssignmentRuleResponse {
  id: string
  companyId: string
  category: string
  groupId: string
  createdAt: string
}

export interface TicketListResponse {
  tickets: TicketListItem[]
}

export interface TicketDetailResponse {
  ticket: Ticket
  replies: TicketReply[]
  transfers: TicketTransfer[]
  evaluation: TicketEvaluation | null
}

export interface CreateReplyResponse {
  id: string
  ticketId: string
  authorId: string
  content: string
  createdAt: string
}

export interface TransferTicketResponse {
  ticket: Ticket
  transfer: TicketTransfer
}
