import type { ApiErrorResponse } from './types';

export class ApiException extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'ApiException';
    this.statusCode = statusCode;
    this.code = code;
  }

  static fromResponse(status: number, body: ApiErrorResponse): ApiException {
    return new ApiException(status, body.error.code, body.error.message);
  }
}

const BASE_URL = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      ...init,
    });
  } catch {
    throw new ApiException(0, 'NETWORK_ERROR', '无法连接到服务器，请检查网络连接');
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const errBody = body as ApiErrorResponse | null;
    if (errBody?.error) {
      throw ApiException.fromResponse(res.status, errBody);
    }
    throw new ApiException(res.status, 'HTTP_ERROR', `请求失败 (${res.status})`);
  }

  return body as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `?${qs}` : '';
}

export function formatApiError(err: unknown): string {
  if (err instanceof ApiException) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return '未知错误';
}
