// Shared type definitions for the helpdesk ticket system

export type TicketStatus =
  | 'pending_assignment'
  | 'pending_processing'
  | 'completed'
  | 'cancelled';

export type SlaPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export type Role = 'submitter' | 'handler' | 'admin';

export type AuditAction =
  | 'created'
  | 'assigned'
  | 'transferred'
  | 'completed'
  | 'cancelled'
  | 'evaluated';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  companyId: number;
  departmentId: number | null;
  roles: string[];
}

// Row types (database row shapes)

export interface TicketRow {
  id: number;
  title: string;
  description: string;
  category_id: number;
  submitter_id: number;
  company_id: number;
  sla_priority: string;
  status: string;
  handler_id: number | null;
  business_group_id: number | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
}

// API response types

export interface TicketResponse {
  id: number;
  title: string;
  description: string;
  categoryId: number;
  categoryName: string;
  submitterId: number;
  submitterName: string;
  companyId: number;
  slaPriority: string;
  status: string;
  handlerId: number | null;
  handlerName: string | null;
  businessGroupId: number | null;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
}

export interface TicketDetailResponse extends TicketResponse {
  companyName: string;
  businessGroupName: string | null;
  replies: ReplyResponse[];
  evaluation: EvaluationResponse | null;
}

export interface ReplyResponse {
  id: number;
  ticketId: number;
  replierId: number;
  replierName: string;
  content: string;
  createdAt: string;
}

export interface EvaluationResponse {
  id: number;
  ticketId: number;
  rating: number;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
    companyId: number;
    departmentId: number | null;
    roles: string[];
  };
}

export interface SubmitterInfoResponse {
  userId: number;
  name: string;
  email: string;
  companyName: string;
  departmentName: string;
  historyTickets: {
    id: number;
    title: string;
    status: string;
    createdAt: string;
  }[];
}

export interface BusinessGroupResponse {
  id: number;
  companyId: number;
  name: string;
  members: {
    id: number;
    userId: number;
    userName: string;
    userEmail: string;
  }[];
}

export interface AssignmentRuleResponse {
  id: number;
  companyId: number;
  categoryId: number;
  categoryName: string;
  targetGroupId: number;
  targetGroupName: string;
}

export interface AuditLogResponse {
  id: string;
  action: string;
  operatorId: number;
  operatorName: string;
  operatorTime: string;
  details: string;
}

export interface StatisticsOverview {
  totalTickets: number;
  completedTickets: number;
  pendingTickets: number;
  cancelledTickets: number;
  averageResponseTimeMinutes: number;
  averageSatisfaction: number;
  satisfactionCount: number;
}

export interface StatisticsDistribution {
  dimension: string;
  items: {
    label: string;
    total: number;
    completed: number;
    pending: number;
    cancelled: number;
  }[];
}

export interface HotTopicsResponse {
  items: {
    categoryId: number;
    categoryName: string;
    ticketCount: number;
  }[];
}
