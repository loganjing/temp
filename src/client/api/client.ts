import type { ApiErrorBody } from '../types';

const BASE_URL = '/api';

export class ApiErrorImpl extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

// 向后兼容别名
export { ApiErrorImpl as ApiError };

/**
 * 提取错误信息：从非 2xx 响应中解析 { error: { code, message } }
 */
async function extractError(res: Response): Promise<ApiErrorImpl> {
  let code = 'UNKNOWN_ERROR';
  let message = `请求失败 (HTTP ${res.status})`;

  try {
    const body: ApiErrorBody = await res.json();
    if (body?.error?.code) code = body.error.code;
    if (body?.error?.message) message = body.error.message;
  } catch {
    // 响应体非 JSON，使用默认消息
  }

  return new ApiErrorImpl(code, message, res.status);
}

/**
 * 通用 fetch 封装，支持错误提取
 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    throw await extractError(res);
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, params?: Record<string, string | undefined>): Promise<T> => {
    let url = path;
    if (params) {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') {
          search.set(key, value);
        }
      }
      const qs = search.toString();
      if (qs) url += `?${qs}`;
    }
    return request<T>(url);
  },

  post: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  patch: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};
