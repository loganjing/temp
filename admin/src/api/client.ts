// API 客户端层
// 端点与类型严格依据 docs/wi-t1000020/technical-contract.md 定义，不臆造 API 行为。

/** 访客审核状态 —— 契约 §3 状态机 */
export type VisitorStatus = 'pending' | 'approved' | 'rejected';

/** 手机号来源 —— 契约 §2.1 phone_source */
export type PhoneSource = 'wechat' | 'manual';

/** 审批操作目标状态 —— 契约 §2.4 请求体 status 仅接受 approved / rejected */
export type ApprovalTargetStatus = 'approved' | 'rejected';

/** 访客登记实体 —— 契约 §2.1 成功响应结构 */
export interface Visitor {
  id: string;
  name: string;
  phone: string;
  id_card: string;
  company: string;
  visit_reason: string;
  host_name: string | null;
  expected_arrival_time: string | null;
  phone_source: PhoneSource;
  status: VisitorStatus;
  created_at: string;
  updated_at: string;
}

/** GET /api/visitors 列表响应 —— 契约 §2.2 */
export interface VisitorListResponse {
  data: Visitor[];
  total: number;
}

/** 通用错误响应 —— 契约 §5 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

/** 包装后的 API 错误，携带 HTTP 状态码与错误体 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(status: number, body: ApiErrorBody) {
    super(body?.error?.message ?? `请求失败（HTTP ${status}）`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error?.code ?? 'UNKNOWN';
    this.fields = body?.error?.fields;
  }
}

const API_BASE = '/api';

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody | undefined;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = undefined;
  }
  // 网络层或非 JSON 错误也归一化为 ApiError
  const status = res.status;
  const code = body?.error?.code ?? 'NETWORK_ERROR';
  const message =
    body?.error?.message ?? `请求失败（HTTP ${status}）`;
  return new ApiError(status, {
    error: { code, message, fields: body?.error?.fields },
  });
}

/** GET /api/visitors?status=pending —— 获取待审核访客列表（契约 §2.2） */
export async function fetchPendingVisitors(): Promise<VisitorListResponse> {
  const res = await fetch(`${API_BASE}/visitors?status=pending`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as VisitorListResponse;
}

/** GET /api/visitors/{id} —— 获取访客登记详情（契约 §2.3） */
export async function fetchVisitorById(id: string): Promise<Visitor> {
  const res = await fetch(`${API_BASE}/visitors/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as Visitor;
}

/**
 * PATCH /api/visitors/{id}/status —— 执行审批（契约 §2.4）
 * @param id 访客登记 ULID
 * @param status 目标状态，仅接受 approved / rejected
 */
export async function updateVisitorStatus(
  id: string,
  status: ApprovalTargetStatus,
): Promise<Visitor> {
  const res = await fetch(
    `${API_BASE}/visitors/${encodeURIComponent(id)}/status`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ status }),
    },
  );
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as Visitor;
}
