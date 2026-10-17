// 工单系统 API 契约类型（camelCase）。
// 字段来源：docs/wi-t1000058/technical-contract.md；src/client/platform/api-client.ts
// 会把服务端 snake_case 响应统一转换为 camelCase，因此这里的字段名与归一化后的
// 响应形状一致。T01 拥有 src/shared/ 契约类型；本文件是客户端侧的本地镜像，
// 与 src/shared/ 交付后需由 T01 owner 对齐（本任务写入范围仅限 src/client/）。

export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export type TicketStatus =
  | 'created'
  | 'pending_assignment'
  | 'pending_handling'
  | 'completed'
  | 'cancelled'

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
  createdAt?: string
}

export interface BusinessGroup {
  id: string
  companyId: string
  name: string
  memberIds: string[]
  createdAt?: string
}

/** GET /api/companies/:id/groups 的返回项（不含 companyId）。 */
export interface GroupSummary {
  id: string
  name: string
  memberIds: string[]
}

export interface BootstrapData {
  companies: Company[]
  users: User[]
  groups: BusinessGroup[]
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

export interface HistoricalTicket {
  id: string
  subject: string
  status: TicketStatus
  priority: Priority
  createdAt: string
}

export interface TicketSubmitter {
  id: string
  name: string
  email: string
  companyId: string
  department: string | null
}

export interface Ticket {
  id: string
  subject: string
  description: string
  category: string
  priority: Priority
  status: TicketStatus
  submitter: TicketSubmitter
  assignedGroupId: string | null
  createdAt: string
  handlerId: string | null
  handledAt: string | null
  cancelledAt: string | null
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

export interface TicketDetail {
  ticket: Ticket
  replies: TicketReply[]
  transfers: TicketTransfer[]
  evaluation: TicketEvaluation | null
}

export interface AssignmentRule {
  id: string
  category: string
  groupId: string
  groupName: string
}

export interface CreateTicketInput {
  operatorId: string
  subject: string
  description: string
  category: string
  priority: Priority
  submitter: { name: string; email: string; department: string | null }
}
