// Platform-neutral shared types, enums, and error codes for the ticket system.
// No Node/Hono/React dependencies — safe for both server and client.

// ── Enums ──────────────────────────────────────────────────────────────

export const TICKET_STATUS = {
  CREATED: 'created',
  PENDING_ASSIGNMENT: 'pending_assignment',
  PENDING_PROCESSING: 'pending_processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const
export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS]

export const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export type Priority = (typeof PRIORITIES)[number]

// ── Error codes ────────────────────────────────────────────────────────

export const ERROR_CODES = {
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_PRIORITY: 'INVALID_PRIORITY',
  INVALID_RATING: 'INVALID_RATING',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  INVALID_TICKET_STATUS: 'INVALID_TICKET_STATUS',
  TRANSFER_TARGET_REQUIRED: 'TRANSFER_TARGET_REQUIRED',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  TICKET_NOT_FOUND: 'TICKET_NOT_FOUND',
  GROUP_NOT_FOUND: 'GROUP_NOT_FOUND',
  MEMBER_EXISTS: 'MEMBER_EXISTS',
  RULE_EXISTS: 'RULE_EXISTS',
  EVALUATION_EXISTS: 'EVALUATION_EXISTS',
  TICKET_NOT_COMPLETED: 'TICKET_NOT_COMPLETED',
} as const
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

// ── ApiError ───────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ── Request types ──────────────────────────────────────────────────────

export interface CreateTicketRequest {
  subject: string
  description?: string
  categoryId: number
  priority: Priority
  submitterId: number
}

export interface UpdateStatusRequest {
  status: 'pending_assignment' | 'pending_processing' | 'completed' | 'cancelled'
  assigneeId?: number
  groupId?: number
}

export interface CreateReplyRequest {
  replierId: number
  content: string
}

export interface TransferTicketRequest {
  fromUserId: number
  toUserId?: number
  toGroupId?: number
  reason?: string
}

export interface CreateEvaluationRequest {
  rating: number
  comment?: string
}

// ── Response types (camelCase, matching API contract) ──────────────────

export interface CompanyResponse {
  id: number
  name: string
  createdAt: string
}

export interface UserResponse {
  id: number
  name: string
  email: string
  companyId: number | null
  companyName: string | null
  department: string | null
  createdAt: string
  historicalTickets?: TicketSummary[]
}

export interface TicketSummary {
  id: number
  ticketNo: string
  subject: string
  status: string
  priority: string
  createdAt: string
}

export interface TicketListItem {
  id: number
  ticketNo: string
  subject: string
  priority: string
  status: string
  categoryId: number
  categoryName: string
  submitterId: number
  submitterName: string
  assignedGroupId: number | null
  assigneeId: number | null
  createdAt: string
}

export interface ReplyResponse {
  id: number
  ticketId: number
  replierId: number
  replierName: string
  content: string
  createdAt: string
}

export interface TransferResponse {
  id: number
  fromUserId: number | null
  fromUserName: string | null
  toUserId: number | null
  toUserName: string | null
  toGroupId: number | null
  toGroupName: string | null
  reason: string | null
  createdAt: string
}

export interface EvaluationResponse {
  id: number
  ticketId: number
  rating: number
  comment: string | null
  createdAt: string
}

export interface TicketDetail {
  id: number
  ticketNo: string
  subject: string
  description: string | null
  categoryId: number
  categoryName: string
  priority: string
  status: string
  submitterId: number
  submitter: {
    id: number
    name: string
    email: string
    companyId: number | null
    companyName: string | null
    department: string | null
    createdAt: string
  }
  assignedGroupId: number | null
  assignedGroup: { id: number; name: string; companyId: number } | null
  assigneeId: number | null
  assignee: { id: number; name: string } | null
  handledById: number | null
  handledAt: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  replies: ReplyResponse[]
  transfers: TransferResponse[]
  evaluation: EvaluationResponse | null
}
