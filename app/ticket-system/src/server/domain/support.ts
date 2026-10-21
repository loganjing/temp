import type { Context } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import type { AuthUser } from '@commonapp/userkit'

// 服务端业务域共享支撑：契约错误、公司上下文、请求校验与分页。

export type FieldIssue = { field: string; message: string }

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: FieldIssue[],
  ) {
    super(message)
  }
}

export const forbiddenCompany = (message = '无权访问其他公司的数据') => new ApiError(403, 'FORBIDDEN_COMPANY', message)
export const ticketNotFound = () => new ApiError(404, 'NOT_FOUND', '工单不存在')
export const invalidState = (message: string) => new ApiError(400, 'INVALID_STATE', message)
export const validationFailed = (details: FieldIssue[]) => new ApiError(400, 'VALIDATION', '请求参数不正确', details)

export const currentAuthUser = (context: Context): AuthUser => {
  const user = (context as unknown as { get(name: string): unknown }).get('currentUser')
  if (!user || typeof (user as { id?: unknown }).id !== 'string') {
    throw new ApiError(401, 'UNAUTHENTICATED', '未登录或会话已过期')
  }
  return user as AuthUser
}

export type CompanyContext = {
  db: DbClient
  userId: string
  userNo: number
  name: string
  email: string
  companyId: number
  companyName: string
  department: string
}

type CompanyContextRow = {
  user_no: number
  name: string
  email: string
  department: string
  company_id: number | null
  company_name: string | null
}

export async function loadCompanyContext(db: DbClient, authUser: { id: string }): Promise<CompanyContext | null> {
  const row = await db.queryOne<CompanyContextRow>({
    text: `SELECT u.user_no, u.name, u.email, u.department, c.id AS company_id, c.name AS company_name
           FROM users u LEFT JOIN companies c ON c.id = CAST(u.company_id AS INTEGER)
           WHERE u.id = ?`,
    params: [authUser.id],
  })
  if (!row || row.company_id === null) return null
  return {
    db,
    userId: authUser.id,
    userNo: row.user_no,
    name: row.name,
    email: row.email,
    companyId: row.company_id,
    companyName: row.company_name ?? '',
    department: row.department ?? '',
  }
}

// 工单系统全部业务端点要求当前用户归属某个公司（提交人/处理人都有公司归属）。
export async function requireCompanyContext(db: DbClient, authUser: { id: string }): Promise<CompanyContext> {
  const context = await loadCompanyContext(db, authUser)
  if (!context) throw new ApiError(403, 'FORBIDDEN_COMPANY', '当前用户未关联公司，无法使用工单功能')
  return context
}

// 按公司名引用公司；不存在则创建（用户创建路径使用）。
export async function ensureCompany(db: DbClient, name: string, now: string): Promise<number> {
  await db.run({ text: 'INSERT OR IGNORE INTO companies (name, created_at) VALUES (?, ?)', params: [name, now] })
  const row = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM companies WHERE name = ?', params: [name] })
  if (!row) throw new ApiError(500, 'INTERNAL_ERROR', '公司创建失败')
  return row.id
}

// 分页：page 从 1 起、pageSize 默认 20、最大 100（契约第 0 节）。
export function parsePagination(query: Record<string, string | undefined>): { page: number; pageSize: number; offset: number } {
  const page = Math.max(Number(query.page ?? 1) || 1, 1)
  const rawSize = Number(query.pageSize ?? 20)
  const size = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 20
  const pageSize = Math.min(size, 100)
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

// 请求体读取器：累积契约形状的校验错误（400 VALIDATION details）。
export class BodyReader {
  readonly issues: FieldIssue[] = []
  private readonly body: Record<string, unknown>

  constructor(body: unknown) {
    this.body = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  }

  addIssue(field: string, message: string): void {
    this.issues.push({ field, message })
  }

  // 字符串字段：未提供或空串返回 null（可选字段）；提供时按长度校验。
  string(field: string, options: { required?: boolean; min?: number; max?: number } = {}): string | null {
    const raw = this.body[field]
    const min = options.min ?? (options.required ? 1 : 0)
    const max = options.max ?? 200
    if (raw === undefined || raw === null || raw === '') {
      if (options.required) this.addIssue(field, `${field} 为必填项`)
      return null
    }
    if (typeof raw !== 'string') {
      this.addIssue(field, `${field} 必须是字符串`)
      return null
    }
    const value = raw.trim()
    if (value.length < min || value.length > max) {
      this.addIssue(field, `${field} 长度须在 ${min}..${max} 之间`)
      return null
    }
    return value
  }

  enumValue(field: string, values: readonly string[], options: { required?: boolean } = {}): string | null {
    const raw = this.body[field]
    if (raw === undefined || raw === null || raw === '') {
      if (options.required) this.addIssue(field, `${field} 为必填项`)
      return null
    }
    if (typeof raw !== 'string' || !values.includes(raw)) {
      this.addIssue(field, `${field} 仅支持 ${values.join('/')}`)
      return null
    }
    return raw
  }

  number(field: string, options: { required?: boolean; min?: number; max?: number } = {}): number | null {
    const raw = this.body[field]
    if (raw === undefined || raw === null) {
      if (options.required) this.addIssue(field, `${field} 为必填项`)
      return null
    }
    if (typeof raw !== 'number' || !Number.isInteger(raw)) {
      this.addIssue(field, `${field} 必须是整数`)
      return null
    }
    const min = options.min ?? (options.required ? 1 : undefined)
    const max = options.max
    if ((min !== undefined && raw < min) || (max !== undefined && raw > max)) {
      this.addIssue(field, `${field} 取值须在 ${min ?? '-∞'}..${max ?? '∞'} 之间`)
      return null
    }
    return raw
  }

  numberArray(field: string): number[] | null {
    const raw = this.body[field]
    if (raw === undefined || raw === null) return []
    if (!Array.isArray(raw)) {
      this.addIssue(field, `${field} 必须是数组`)
      return null
    }
    const values: number[] = []
    for (const item of raw) {
      if (typeof item !== 'number' || !Number.isInteger(item) || item <= 0) {
        this.addIssue(field, `${field} 的元素必须是正整数`)
        return null
      }
      values.push(item)
    }
    return values
  }
}
