import type {
  AssignmentRule,
  AssignTicketBody,
  BusinessGroup,
  Category,
  CreateTicketBody,
  Rating,
  Reply,
  Ticket,
  TicketDetail,
  TicketListParams,
  User,
} from './types';

/** 统一 API 错误：对应契约错误体 {error:{code,message}}。 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** 当前操作者（X-User-Id 请求头来源，由用户切换器维护）。 */
let currentUserId: number | null = null;

export function setCurrentUserId(id: number | null): void {
  currentUserId = id;
}

export function getCurrentUserId(): number | null {
  return currentUserId;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (currentUserId !== null) {
    headers['X-User-Id'] = String(currentUserId);
  }
  let body: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  let res: Response;
  try {
    res = await fetch(path, { method: options.method ?? 'GET', headers, body });
  } catch (err) {
    throw new ApiError(0, 'NETWORK_ERROR', err instanceof Error ? err.message : '网络请求失败');
  }
  if (!res.ok) {
    let code = 'UNKNOWN_ERROR';
    let message = `请求失败（HTTP ${res.status}）`;
    try {
      const data: unknown = await res.json();
      if (data !== null && typeof data === 'object' && 'error' in data) {
        const errBody = (data as { error: unknown }).error;
        if (errBody !== null && typeof errBody === 'object') {
          const { code: parsedCode, message: parsedMessage } = errBody as {
            code?: unknown;
            message?: unknown;
          };
          if (typeof parsedCode === 'string' && parsedCode.length > 0) code = parsedCode;
          if (typeof parsedMessage === 'string' && parsedMessage.length > 0) message = parsedMessage;
        }
      }
    } catch {
      // 响应体不是 JSON 时保留默认错误信息
    }
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

/** 统一错误文案。 */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message.length > 0) return err.message;
  return '操作失败，请稍后重试';
}

/** ApiError 判别（可按错误码过滤）。 */
export function isApiError(err: unknown, code?: string): err is ApiError {
  return err instanceof ApiError && (code === undefined || err.code === code);
}

// ===== 用户与组织配置（契约第 2 节） =====

export async function listUsers(): Promise<User[]> {
  const data = await request<{ users: User[] }>('/api/users');
  return data.users;
}

export async function listBusinessGroups(companyId: number): Promise<BusinessGroup[]> {
  const data = await request<{ groups: BusinessGroup[] }>(
    `/api/companies/${companyId}/business-groups`,
  );
  return data.groups;
}

export async function createBusinessGroup(
  companyId: number,
  body: { name: string },
): Promise<BusinessGroup> {
  return request<BusinessGroup>(`/api/companies/${companyId}/business-groups`, {
    method: 'POST',
    body,
  });
}

export async function setGroupMembers(
  groupId: number,
  body: { userIds: number[] },
): Promise<BusinessGroup> {
  return request<BusinessGroup>(`/api/business-groups/${groupId}/members`, {
    method: 'PUT',
    body,
  });
}

export async function listAssignmentRules(companyId: number): Promise<AssignmentRule[]> {
  const data = await request<{ rules: AssignmentRule[] }>(
    `/api/companies/${companyId}/assignment-rules`,
  );
  return data.rules;
}

export async function createAssignmentRule(
  companyId: number,
  body: { categoryId: number; groupId: number },
): Promise<AssignmentRule> {
  return request<AssignmentRule>(`/api/companies/${companyId}/assignment-rules`, {
    method: 'POST',
    body,
  });
}

export async function listCategories(): Promise<Category[]> {
  const data = await request<{ categories: Category[] }>('/api/categories');
  return data.categories;
}

export async function createCategory(body: { name: string }): Promise<Category> {
  return request<Category>('/api/categories', { method: 'POST', body });
}

// ===== 工单（契约第 3 节） =====

export async function createTicket(body: CreateTicketBody): Promise<TicketDetail> {
  return request<TicketDetail>('/api/tickets', { method: 'POST', body });
}

export async function getTicket(ticketId: number): Promise<TicketDetail> {
  return request<TicketDetail>(`/api/tickets/${ticketId}`);
}

export async function listTickets(params: TicketListParams = {}): Promise<Ticket[]> {
  const query = buildQuery({
    status: params.status,
    categoryId: params.categoryId,
    companyId: params.companyId,
    submitterId: params.submitterId,
  });
  const data = await request<{ tickets: Ticket[] }>(`/api/tickets${query}`);
  return data.tickets;
}

export async function listUserTickets(userId: number): Promise<Ticket[]> {
  const data = await request<{ tickets: Ticket[] }>(`/api/users/${userId}/tickets`);
  return data.tickets;
}

export async function dispatchTicket(ticketId: number): Promise<TicketDetail> {
  return request<TicketDetail>(`/api/tickets/${ticketId}/dispatch`, {
    method: 'POST',
    body: {},
  });
}

export async function assignTicket(
  ticketId: number,
  body: AssignTicketBody,
): Promise<TicketDetail> {
  return request<TicketDetail>(`/api/tickets/${ticketId}/assign`, { method: 'POST', body });
}

export async function replyTicket(
  ticketId: number,
  body: { content: string },
): Promise<{ reply: Reply; ticket: TicketDetail }> {
  return request<{ reply: Reply; ticket: TicketDetail }>(`/api/tickets/${ticketId}/replies`, {
    method: 'POST',
    body,
  });
}

export async function reassignTicket(
  ticketId: number,
  body: AssignTicketBody,
): Promise<TicketDetail> {
  return request<TicketDetail>(`/api/tickets/${ticketId}/reassign`, { method: 'POST', body });
}

export async function completeTicket(
  ticketId: number,
  body?: { note?: string },
): Promise<TicketDetail> {
  return request<TicketDetail>(`/api/tickets/${ticketId}/complete`, { method: 'POST', body });
}

export async function cancelTicket(
  ticketId: number,
  body?: { reason?: string },
): Promise<TicketDetail> {
  return request<TicketDetail>(`/api/tickets/${ticketId}/cancel`, { method: 'POST', body });
}

export async function rateTicket(
  ticketId: number,
  body: { score: number; comment?: string },
): Promise<Rating> {
  const data = await request<{ rating: Rating }>(`/api/tickets/${ticketId}/rating`, {
    method: 'POST',
    body,
  });
  return data.rating;
}
