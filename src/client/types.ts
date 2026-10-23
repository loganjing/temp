/**
 * Contract-based type definitions derived from technical-contract.md.
 * All IDs are `number` per the contract's ID type table (SQLite INTEGER PK AUTOINCREMENT,
 * serialized as JSON number, no frontend conversion needed).
 */

// ── Enums ──────────────────────────────────────────────────────────────────

export type TicketStatus =
  | 'pending_assignment'
  | 'pending_processing'
  | 'completed'
  | 'cancelled';

export type SlaPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export type AuditAction =
  | 'created'
  | 'assigned'
  | 'transferred'
  | 'completed'
  | 'cancelled'
  | 'evaluated';

export type UserRole = 'submitter' | 'handler' | 'admin';

// ── Auth ───────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  companyId: number;
  departmentId: number;
  roles: UserRole[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

// ── Ticket ─────────────────────────────────────────────────────────────────

export interface Ticket {
  id: number;
  title: string;
  description: string;
  categoryId: number;
  categoryName: string;
  submitterId: number;
  submitterName: string;
  companyId: number;
  companyName?: string;
  slaPriority: SlaPriority;
  status: TicketStatus;
  handlerId: number | null;
  handlerName: string | null;
  businessGroupId: number | null;
  businessGroupName?: string;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
}

export interface TicketListResponse {
  items: Ticket[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TicketListQuery {
  status?: TicketStatus;
  companyId?: number;
  categoryId?: number;
  slaPriority?: SlaPriority;
  businessGroupId?: number;
  handlerId?: number;
  submitterId?: number;
  keyword?: string;
  sortBy?: 'createdAt' | 'slaPriority' | 'status';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface WorkbenchQuery {
  companyId?: number;
  slaPriority?: SlaPriority;
  categoryId?: number;
  keyword?: string;
  sortBy?: 'createdAt' | 'slaPriority';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface CreateTicketRequest {
  title: string;
  description: string;
  categoryId: number;
  slaPriority: SlaPriority;
}

export interface UpdateTicketStatusRequest {
  status: TicketStatus;
  handlerId?: number;
  businessGroupId?: number;
}

export interface TransferTicketRequest {
  targetUserId: number;
}

export interface TicketDetail extends Ticket {
  replies: TicketReply[];
  evaluation: SatisfactionEvaluation | null;
}

// ── Ticket Reply ───────────────────────────────────────────────────────────

export interface TicketReply {
  id: number;
  ticketId?: number;
  replierId: number;
  replierName: string;
  content: string;
  createdAt: string;
}

export interface CreateReplyRequest {
  content: string;
}

// ── Satisfaction Evaluation ────────────────────────────────────────────────

export interface SatisfactionEvaluation {
  id: number;
  ticketId: number;
  rating: number;
  createdAt: string;
}

export interface CreateEvaluationRequest {
  rating: number;
}

// ── Submitter Info ─────────────────────────────────────────────────────────

export interface SubmitterHistoryTicket {
  id: number;
  title: string;
  status: TicketStatus;
  createdAt: string;
}

export interface SubmitterInfo {
  userId: number;
  name: string;
  email: string;
  companyName: string;
  departmentName: string;
  historyTickets: SubmitterHistoryTicket[];
}

// ── Business Group ─────────────────────────────────────────────────────────

export interface BusinessGroupMember {
  id: number;
  userId: number;
  userName: string;
  userEmail?: string;
}

export interface BusinessGroup {
  id: number;
  companyId: number;
  name: string;
  members: BusinessGroupMember[];
}

export interface BusinessGroupListResponse {
  items: BusinessGroup[];
}

export interface CreateBusinessGroupRequest {
  name: string;
  memberUserIds: number[];
}

export interface AddMemberRequest {
  userId: number;
}

// ── Assignment Rule ────────────────────────────────────────────────────────

export interface AssignmentRule {
  id: number;
  companyId: number;
  categoryId: number;
  categoryName: string;
  targetGroupId: number;
  targetGroupName: string;
}

export interface AssignmentRuleListResponse {
  items: AssignmentRule[];
}

export interface CreateAssignmentRuleRequest {
  categoryId: number;
  targetGroupId: number;
}

// ── Statistics ─────────────────────────────────────────────────────────────

export interface StatisticsOverview {
  totalTickets: number;
  completedTickets: number;
  pendingTickets: number;
  cancelledTickets: number;
  averageResponseTimeMinutes: number;
  averageSatisfaction: number;
  satisfactionCount: number;
}

export interface DistributionItem {
  label: string;
  total: number;
  completed: number;
  pending: number;
  cancelled: number;
}

export interface DistributionResponse {
  dimension: 'company' | 'department';
  items: DistributionItem[];
}

export interface HotTopic {
  categoryId: number;
  categoryName: string;
  ticketCount: number;
}

export interface HotTopicsResponse {
  items: HotTopic[];
}

// ── Operation Log ──────────────────────────────────────────────────────────

export interface TicketLog {
  id: string;
  action: AuditAction;
  operatorId: number;
  operatorName: string;
  operatorTime: string;
  details: string;
}

export interface TicketLogListResponse {
  items: TicketLog[];
}

// ── Reference Data ─────────────────────────────────────────────────────────

export interface Category {
  id: number;
  name: string;
}
