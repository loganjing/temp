import type { ApiError } from '../shared/types.js';

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'INVALID_TRANSITION'
  | 'ALREADY_RATED'
  | 'DUPLICATE_RULE'
  | 'INTERNAL';

const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  INVALID_TRANSITION: 409,
  ALREADY_RATED: 409,
  DUPLICATE_RULE: 409,
  INTERNAL: 500,
};

export class AppError extends Error {
  code: ErrorCode;
  details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return ERROR_HTTP_STATUS[this.code];
  }

  toResponse(): ApiError {
    const body: ApiError = {
      error: {
        code: this.code,
        message: this.message,
      },
    };
    if (this.details) {
      body.error.details = this.details;
    }
    return body;
  }
}

export function toApiError(code: ErrorCode, message: string, details?: Record<string, unknown>): ApiError {
  const body: ApiError = { error: { code, message } };
  if (details) body.error.details = details;
  return body;
}

// ---- Validation helpers ----

export function assertRequired(value: unknown, field: string): asserts value is string {
  if (value === undefined || value === null || value === '') {
    throw new AppError('VALIDATION_FAILED', `字段 ${field} 为必填`, { fields: { [field]: ['required'] } });
  }
}

export function assertString(value: unknown, field: string, opts?: { min?: number; max?: number }): string {
  if (value === undefined || value === null) {
    throw new AppError('VALIDATION_FAILED', `字段 ${field} 为必填`, { fields: { [field]: ['required'] } });
  }
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_FAILED', `字段 ${field} 必须为字符串`, { fields: { [field]: ['must be string'] } });
  }
  if (opts?.min !== undefined && value.length < opts.min) {
    throw new AppError('VALIDATION_FAILED', `字段 ${field} 长度不得少于 ${opts.min}`, { fields: { [field]: [`min length ${opts.min}`] } });
  }
  if (opts?.max !== undefined && value.length > opts.max) {
    throw new AppError('VALIDATION_FAILED', `字段 ${field} 长度不得超过 ${opts.max}`, { fields: { [field]: [`max length ${opts.max}`] } });
  }
  return value;
}

export function assertEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new AppError('VALIDATION_FAILED', `字段 ${field} 必须为 ${allowed.join('|')} 之一`, { fields: { [field]: [`must be one of ${allowed.join('|')}`] } });
  }
  return value as T;
}

export function assertInteger(value: unknown, field: string, opts?: { min?: number; max?: number }): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new AppError('VALIDATION_FAILED', `字段 ${field} 必须为整数`, { fields: { [field]: ['must be integer'] } });
  }
  if (opts?.min !== undefined && value < opts.min) {
    throw new AppError('VALIDATION_FAILED', `字段 ${field} 不得小于 ${opts.min}`, { fields: { [field]: [`min ${opts.min}`] } });
  }
  if (opts?.max !== undefined && value > opts.max) {
    throw new AppError('VALIDATION_FAILED', `字段 ${field} 不得大于 ${opts.max}`, { fields: { [field]: [`max ${opts.max}`] } });
  }
  return value;
}

export function assertOptionalString(value: unknown, field: string, opts?: { max?: number }): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_FAILED', `字段 ${field} 必须为字符串`, { fields: { [field]: ['must be string'] } });
  }
  if (opts?.max !== undefined && value.length > opts.max) {
    throw new AppError('VALIDATION_FAILED', `字段 ${field} 长度不得超过 ${opts.max}`, { fields: { [field]: [`max length ${opts.max}`] } });
  }
  return value;
}
