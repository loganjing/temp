/**
 * 统一业务错误（technical-contract.md 第 1 节错误格式）。
 * 响应体统一为 {"error": {"code": "<CODE>", "message": "<可读说明>"}}。
 */

export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export function validationError(message) {
  return new AppError(400, 'VALIDATION_ERROR', message);
}

export function notFound(message) {
  return new AppError(404, 'NOT_FOUND', message);
}

export function forbidden(message) {
  return new AppError(403, 'FORBIDDEN', message);
}

export function invalidUser(message) {
  return new AppError(401, 'INVALID_USER', message);
}

export function invalidState(message) {
  return new AppError(409, 'INVALID_STATE', message);
}

export function conflict(message) {
  return new AppError(409, 'CONFLICT', message);
}

/** 请求体字段校验辅助（契约第 1 节 VALIDATION_ERROR 语义） */

export function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationError(`字段 ${field} 必须为非空字符串`);
  }
  return value;
}

export function optionalString(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw validationError(`字段 ${field} 必须为字符串`);
  }
  return value;
}

export function requireInteger(value, field) {
  if (!Number.isInteger(value)) {
    throw validationError(`字段 ${field} 必须为整数`);
  }
  return value;
}

export function optionalInteger(value, field) {
  if (value === undefined || value === null) return null;
  return requireInteger(value, field);
}
