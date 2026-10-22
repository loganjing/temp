// Shared types for the ticket system (used by both server and client)

export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
export type TicketStatus = 'created' | 'pending_assignment' | 'pending_handling' | 'completed' | 'cancelled';
export type AssignedMode = 'auto' | 'manual';
export type ReplyAuthorRole = 'submitter' | 'handler';
export type Role = 'submitter' | 'handler' | 'admin';

export type LogAction =
  | 'ticket_created'
  | 'ticket_assigned'
  | 'ticket_transferred'
  | 'ticket_replied'
  | 'ticket_status_changed'
  | 'ticket_completed'
  | 'ticket_cancelled'
  | 'rating_submitted';

export type NotificationStatus = 'queued' | 'sent' | 'failed';

export type Capability = 'submit_ticket' | 'handle_ticket' | 'configure_assignment' | 'view_stats';

export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  submitter: ['submit_ticket'],
  handler: ['submit_ticket', 'handle_ticket', 'view_stats'],
  admin: ['submit_ticket', 'handle_ticket', 'configure_assignment', 'view_stats'],
};

export interface UserSummary {
  id: string;
  name: string;
}

export interface UserContext {
  id: string;
  name: string;
  email: string;
  companyId: string;
  companyName: string;
  department: string;
  role: Role;
}

export interface SubmitterInfo {
  id: string;
  name: string;
  email: string;
  companyId: string;
  department: string;
}

export interface AssignmentInfo {
  groupId: string;
  groupName: string;
  assignedAt: string;
  assignedMode: AssignedMode;
  assigneeId: string | null;
}

export interface CompletionInfo {
  handledBy: UserSummary;
  handledAt: string;
}

export interface RatingInfo {
  score: number;
  ratedBy: UserSummary;
  ratedAt: string;
}

export interface Ticket {
  id: string;
  companyId: string;
  companyName: string;
  subject: string;
  description: string;
  category: string;
  priority: Priority;
  status: TicketStatus;
  submitter: SubmitterInfo;
  createdAt: string;
  assignment: AssignmentInfo | null;
  completion: CompletionInfo | null;
  cancelledAt: string | null;
  rating: RatingInfo | null;
  replyCount: number;
}

export interface Reply {
  id: string;
  ticketId: string;
  author: UserSummary;
  authorRole: ReplyAuthorRole;
  content: string;
  createdAt: string;
}

export interface Transfer {
  id: string;
  fromGroupId: string | null;
  fromUserId: string | null;
  toGroupId: string | null;
  toUserId: string | null;
  transferredBy: UserSummary;
  transferredAt: string;
  note: string | null;
}

export interface LogEntry {
  id: string;
  ticketId: string;
  action: LogAction;
  actor: UserSummary;
  createdAt: string;
  detail: Record<string, unknown> | null;
}

export interface BusinessGroupMember {
  id: string;
  name: string;
  email: string;
  department: string;
}

export interface BusinessGroup {
  id: string;
  companyId: string;
  name: string;
  members: BusinessGroupMember[];
}

export interface AssignmentRule {
  id: string;
  companyId: string;
  category: string;
  groupId: string;
  groupName: string;
  enabled: boolean;
}

export interface Notification {
  id: string;
  ticketId: string;
  toEmail: string;
  subject: string;
  status: NotificationStatus;
  createdAt: string;
  sentAt: string | null;
  error: string | null;
}

export interface TicketListResult {
  items: Ticket[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TicketDetail {
  ticket: Ticket;
  replies: Reply[];
  transfers: Transfer[];
  logs: LogEntry[];
}

export interface SessionResponse {
  user: UserContext | null;
  capabilities: Capability[];
}

export interface DistributionItem {
  key: string;
  label: string;
  count: number;
}

export interface DashboardStats {
  ticketCount: number;
  avgResponseMinutes: number | null;
  avgResponseSampleCount: number;
  avgSatisfaction: number | null;
  ratingSampleCount: number;
  hotCategories: { category: string; count: number }[];
}

export interface SubmitterProfile {
  user: {
    id: string;
    name: string;
    email: string;
    companyId: string;
    companyName: string;
    department: string;
  };
  historyTickets: {
    items: { id: string; subject: string; status: TicketStatus; createdAt: string }[];
    total: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
