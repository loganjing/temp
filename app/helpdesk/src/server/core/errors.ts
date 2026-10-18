// API error carrying the contract §1 shape: { error: { code, message, details? } }.
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'STATE_CONFLICT'
  | 'ASSIGNEE_ON_VACATION'
  | 'ASSIGNEE_NOT_IN_DEPARTMENT'
  | 'RATING_EXISTS'
  | 'TICKET_NOT_DRAFT'
  | 'FILE_TOO_LARGE'
  | 'VALIDATION'
  | 'RULE_TEAM_DEPARTMENT_MISMATCH'
  | 'CSV_ROW_INVALID'
  | 'INTERNAL'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

export const authRequired = (message: string) => new ApiError(401, 'AUTH_REQUIRED', message)
export const invalidCredentials = (message: string) => new ApiError(401, 'INVALID_CREDENTIALS', message)
export const forbidden = (message: string) => new ApiError(403, 'FORBIDDEN', message)
export const notFound = (message: string) => new ApiError(404, 'NOT_FOUND', message)
export const stateConflict = (message: string, details?: unknown) =>
  new ApiError(409, 'STATE_CONFLICT', message, details)
export const assigneeOnVacation = (message: string) => new ApiError(409, 'ASSIGNEE_ON_VACATION', message)
export const assigneeNotInDepartment = (message: string) =>
  new ApiError(409, 'ASSIGNEE_NOT_IN_DEPARTMENT', message)
export const ratingExists = (message: string) => new ApiError(409, 'RATING_EXISTS', message)
export const ticketNotDraft = (message: string, details?: unknown) =>
  new ApiError(409, 'TICKET_NOT_DRAFT', message, details)
export const fileTooLarge = (message: string) => new ApiError(413, 'FILE_TOO_LARGE', message)
export const validation = (message: string, fields?: string[]) =>
  new ApiError(422, 'VALIDATION', message, fields ? { fields } : undefined)
export const ruleTeamDepartmentMismatch = (message: string) =>
  new ApiError(422, 'RULE_TEAM_DEPARTMENT_MISMATCH', message)
export const csvRowInvalid = (message: string, row: unknown) =>
  new ApiError(400, 'CSV_ROW_INVALID', message, { row })
export const internal = (message: string) => new ApiError(500, 'INTERNAL', message)

export function toErrorResponse(error: ApiError, c: Context) {
  const body: Record<string, unknown> = { code: error.code, message: error.message }
  if (error.details !== undefined) body.details = error.details
  return c.json({ error: body }, error.status as ContentfulStatusCode)
}
