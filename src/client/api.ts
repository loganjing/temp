/**
 * HTTP client wrapping fetch with Bearer Token injection and
 * structured error handling.
 *
 * Token is stored in localStorage under `ticket_token`.
 * All API functions return typed promises; non-2xx responses throw
 * `ApiError` with status and message.
 */

import type {
  LoginRequest,
  LoginResponse,
  AuthUser,
  Ticket,
  TicketListResponse,
  TicketListQuery,
  WorkbenchQuery,
  TicketDetail,
  CreateTicketRequest,
  UpdateTicketStatusRequest,
  TransferTicketRequest,
  TicketReply,
  CreateReplyRequest,
  SatisfactionEvaluation,
  CreateEvaluationRequest,
  SubmitterInfo,
  BusinessGroup,
  BusinessGroupListResponse,
  CreateBusinessGroupRequest,
  AddMemberRequest,
  AssignmentRule,
  AssignmentRuleListResponse,
  CreateAssignmentRuleRequest,
  StatisticsOverview,
  DistributionResponse,
  HotTopicsResponse,
  TicketLog,
} from './types';

const TOKEN_KEY = 'ticket_token';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function buildQueryString(params: object): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      sp.append(key, String(value));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  opts?: {
    body?: unknown;
    query?: object;
    auth?: boolean;
  },
): Promise<T> {
  const url = path + buildQueryString(opts?.query ?? {});
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (opts?.auth !== false) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && 'error' in data
        ? String((data as Record<string, unknown>).error)
        : `HTTP ${res.status}`) || `HTTP ${res.status}`;
    throw new ApiError(res.status, msg, data);
  }

  return data as T;
}

// ── Auth ───────────────────────────────────────────────────────────────────

export const api = {
  login(body: LoginRequest): Promise<LoginResponse> {
    return request<LoginResponse>('POST', '/api/auth/login', {
      body,
      auth: false,
    });
  },

  getMe(): Promise<AuthUser> {
    return request<AuthUser>('GET', '/api/auth/me');
  },

  // ── Tickets ──────────────────────────────────────────────────────────────

  listTickets(query: TicketListQuery): Promise<TicketListResponse> {
    return request<TicketListResponse>('GET', '/api/tickets', { query });
  },

  getTicket(id: number): Promise<TicketDetail> {
    return request<TicketDetail>('GET', `/api/tickets/${id}`);
  },

  createTicket(body: CreateTicketRequest): Promise<Ticket> {
    return request<Ticket>('POST', '/api/tickets', { body });
  },

  updateTicketStatus(
    id: number,
    body: UpdateTicketStatusRequest,
  ): Promise<Ticket> {
    return request<Ticket>('PATCH', `/api/tickets/${id}/status`, { body });
  },

  transferTicket(id: number, body: TransferTicketRequest): Promise<Ticket> {
    return request<Ticket>('POST', `/api/tickets/${id}/transfer`, { body });
  },

  completeTicket(id: number): Promise<Ticket> {
    return request<Ticket>('POST', `/api/tickets/${id}/complete`, { body: {} });
  },

  cancelTicket(id: number): Promise<Ticket> {
    return request<Ticket>('POST', `/api/tickets/${id}/cancel`, { body: {} });
  },

  // ── Replies ──────────────────────────────────────────────────────────────

  listReplies(id: number): Promise<{ items: TicketReply[] }> {
    return request<{ items: TicketReply[] }>(
      'GET',
      `/api/tickets/${id}/replies`,
    );
  },

  createReply(id: number, body: CreateReplyRequest): Promise<TicketReply> {
    return request<TicketReply>('POST', `/api/tickets/${id}/replies`, { body });
  },

  // ── Evaluation ───────────────────────────────────────────────────────────

  getEvaluation(id: number): Promise<SatisfactionEvaluation> {
    return request<SatisfactionEvaluation>(
      'GET',
      `/api/tickets/${id}/evaluation`,
    );
  },

  createEvaluation(
    id: number,
    body: CreateEvaluationRequest,
  ): Promise<SatisfactionEvaluation> {
    return request<SatisfactionEvaluation>(
      'POST',
      `/api/tickets/${id}/evaluation`,
      { body },
    );
  },

  // ── Submitter Info ───────────────────────────────────────────────────────

  getSubmitterInfo(id: number): Promise<SubmitterInfo> {
    return request<SubmitterInfo>('GET', `/api/tickets/${id}/submitter-info`);
  },

  // ── Business Groups ──────────────────────────────────────────────────────

  listBusinessGroups(companyId?: number): Promise<BusinessGroupListResponse> {
    return request<BusinessGroupListResponse>('GET', '/api/business-groups', {
      query: companyId ? { companyId } : undefined,
    });
  },

  createBusinessGroup(
    body: CreateBusinessGroupRequest,
  ): Promise<BusinessGroup> {
    return request<BusinessGroup>('POST', '/api/business-groups', { body });
  },

  addMember(
    groupId: number,
    body: AddMemberRequest,
  ): Promise<{ id: number; groupId: number; userId: number; userName: string }> {
    return request('POST', `/api/business-groups/${groupId}/members`, { body });
  },

  removeMember(groupId: number, userId: number): Promise<void> {
    return request<void>(
      'DELETE',
      `/api/business-groups/${groupId}/members/${userId}`,
    );
  },

  // ── Assignment Rules ─────────────────────────────────────────────────────

  listAssignmentRules(companyId?: number): Promise<AssignmentRuleListResponse> {
    return request<AssignmentRuleListResponse>(
      'GET',
      '/api/assignment-rules',
      { query: companyId ? { companyId } : undefined },
    );
  },

  createAssignmentRule(
    body: CreateAssignmentRuleRequest,
  ): Promise<AssignmentRule> {
    return request<AssignmentRule>('POST', '/api/assignment-rules', { body });
  },

  deleteAssignmentRule(id: number): Promise<void> {
    return request<void>('DELETE', `/api/assignment-rules/${id}`);
  },

  // ── Workbench ────────────────────────────────────────────────────────────

  workbenchTickets(
    query: WorkbenchQuery,
  ): Promise<TicketListResponse> {
    return request<TicketListResponse>('GET', '/api/workbench/tickets', {
      query,
    });
  },

  // ── Statistics ───────────────────────────────────────────────────────────

  statisticsOverview(query?: {
    companyId?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<StatisticsOverview> {
    return request<StatisticsOverview>('GET', '/api/statistics/overview', {
      query,
    });
  },

  statisticsDistribution(query: {
    dimension: 'company' | 'department';
    companyId?: number;
  }): Promise<DistributionResponse> {
    return request<DistributionResponse>(
      'GET',
      '/api/statistics/distribution',
      { query },
    );
  },

  statisticsHotTopics(query?: {
    companyId?: number;
    limit?: number;
  }): Promise<HotTopicsResponse> {
    return request<HotTopicsResponse>('GET', '/api/statistics/hot-topics', {
      query,
    });
  },

  // ── Logs ─────────────────────────────────────────────────────────────────

  getTicketLogs(id: number): Promise<{ items: TicketLog[] }> {
    return request<{ items: TicketLog[] }>('GET', `/api/tickets/${id}/logs`);
  },
};
