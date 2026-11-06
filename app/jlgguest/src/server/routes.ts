import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import type { initializePlatform } from './platform/bootstrap'
import {
  ISO_8601_REGEX,
  VISITOR_FIELD_LIMITS,
  VISITOR_STATUSES,
  type CreateVisitorBody,
  type Visitor,
  type VisitorStatus,
} from '../shared/types'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

// 数据库行结构，列名与 visitors 表一致；status 在数据库层已由 CHECK 约束保证取值合法。
interface VisitorRow {
  id: number
  name: string
  phone: string
  id_card: string
  company: string
  visit_reason: string
  host_person: string
  expected_arrival_time: string
  license_plate: string | null
  status: string
  created_at: string
  updated_at: string
  reviewed_at: string | null
}

// 校验通过后用于 INSERT 的数据。
interface VisitorInsert {
  name: string
  phone: string
  id_card: string
  company: string
  visit_reason: string
  host_person: string
  expected_arrival_time: string
  license_plate: string | null
}

const REQUIRED_STRING_FIELDS = [
  { key: 'name', limit: VISITOR_FIELD_LIMITS.name },
  { key: 'phone', limit: VISITOR_FIELD_LIMITS.phone },
  { key: 'id_card', limit: VISITOR_FIELD_LIMITS.id_card },
  { key: 'company', limit: VISITOR_FIELD_LIMITS.company },
  { key: 'visit_reason', limit: VISITOR_FIELD_LIMITS.visit_reason },
  { key: 'host_person', limit: VISITOR_FIELD_LIMITS.host_person },
] as const

const REQUIRED_FIELD_NAMES = [...REQUIRED_STRING_FIELDS.map((f) => f.key), 'expected_arrival_time'] as const

function toVisitor(row: VisitorRow): Visitor {
  return { ...row, status: row.status as VisitorStatus }
}

function isIso8601(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_8601_REGEX.test(value)) return false
  return !Number.isNaN(new Date(value).getTime())
}

// 校验 POST 请求体，返回缺失/非法字段名列表与（校验通过时的）待插入数据。
function validateCreateVisitor(body: unknown): { fields: string[]; data: VisitorInsert | null } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { fields: [...REQUIRED_FIELD_NAMES], data: null }
  }
  const record = body as Record<string, unknown>
  const fields: string[] = []
  const data: VisitorInsert = {
    name: '',
    phone: '',
    id_card: '',
    company: '',
    visit_reason: '',
    host_person: '',
    expected_arrival_time: '',
    license_plate: null,
  }

  for (const { key, limit } of REQUIRED_STRING_FIELDS) {
    const value = record[key]
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > limit) {
      fields.push(key)
    } else {
      data[key] = value
    }
  }

  const arrival = record['expected_arrival_time']
  if (!isIso8601(arrival)) {
    fields.push('expected_arrival_time')
  } else {
    data.expected_arrival_time = arrival
  }

  const plate = record['license_plate']
  if (plate === undefined || plate === null) {
    data.license_plate = null
  } else if (typeof plate === 'string') {
    const trimmed = plate.trim()
    if (trimmed.length === 0) {
      data.license_plate = null
    } else if (trimmed.length > VISITOR_FIELD_LIMITS.license_plate) {
      fields.push('license_plate')
    } else {
      data.license_plate = trimmed
    }
  } else {
    fields.push('license_plate')
  }

  return fields.length > 0 ? { fields, data: null } : { fields, data }
}

// 登录/SSO 等公开端点及当前阶段无身份认证的访客 API 在此注册。
export function registerPublicRoutes(app: Hono, platform: Platform) {
  const db: DbClient = platform.db

  // 提交访客登记。
  app.post('/api/visitors', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'request body must be valid JSON', fields: [...REQUIRED_FIELD_NAMES] }, 400)
    }

    const { fields, data } = validateCreateVisitor(body)
    if (!data) return c.json({ error: 'missing or invalid required fields', fields }, 400)

    const row = await db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO visitors (name, phone, id_card, company, visit_reason, host_person, expected_arrival_time, license_plate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        params: [data.name, data.phone, data.id_card, data.company, data.visit_reason, data.host_person, data.expected_arrival_time, data.license_plate],
      })
      return tx.queryOne<VisitorRow>({ text: 'SELECT * FROM visitors WHERE id = last_insert_rowid()' })
    })
    if (!row) return c.json({ error: 'failed to create visitor record' }, 500)
    return c.json(toVisitor(row), 201)
  })

  // 查询访客登记列表，支持按状态筛选与分页。
  app.get('/api/visitors', async (c) => {
    const statusQuery = c.req.query('status')
    const statusFilter =
      statusQuery && (VISITOR_STATUSES as readonly string[]).includes(statusQuery) ? statusQuery : undefined

    const pageParam = Number(c.req.query('page'))
    const limitParam = Number(c.req.query('limit'))
    const page = Number.isInteger(pageParam) && pageParam >= 1 ? pageParam : 1
    const limit = Number.isInteger(limitParam) && limitParam >= 1 ? Math.min(limitParam, 100) : 20
    const offset = (page - 1) * limit

    const listSql = statusFilter
      ? 'SELECT * FROM visitors WHERE status = ? ORDER BY id DESC LIMIT ? OFFSET ?'
      : 'SELECT * FROM visitors ORDER BY id DESC LIMIT ? OFFSET ?'
    const listParams = statusFilter ? [statusFilter, limit, offset] : [limit, offset]
    const rows = await db.queryAll<VisitorRow>({ text: listSql, params: listParams })

    const countSql = statusFilter ? 'SELECT COUNT(*) AS total FROM visitors WHERE status = ?' : 'SELECT COUNT(*) AS total FROM visitors'
    const countParams = statusFilter ? [statusFilter] : []
    const countRow = await db.queryOne<{ total: number }>({ text: countSql, params: countParams })
    const total = countRow?.total ?? 0

    return c.json({ items: rows.map(toVisitor), total, page, limit }, 200)
  })

  // 查询单条访客登记详情。
  app.get('/api/visitors/:id', async (c) => {
    const id = Number(c.req.param('id'))
    if (!Number.isInteger(id) || id < 1) return c.json({ error: 'visitor not found' }, 404)
    const row = await db.queryOne<VisitorRow>({ text: 'SELECT * FROM visitors WHERE id = ?', params: [id] })
    if (!row) return c.json({ error: 'visitor not found' }, 404)
    return c.json(toVisitor(row), 200)
  })

  // 更新访客审批状态：仅允许 pending → approved/rejected，终态不可变更。
  app.patch('/api/visitors/:id/status', async (c) => {
    const id = Number(c.req.param('id'))
    if (!Number.isInteger(id) || id < 1) return c.json({ error: 'visitor not found' }, 404)

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'request body must be valid JSON' }, 400)
    }

    const target =
      typeof body === 'object' && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>)['status']
        : undefined
    if (target !== 'approved' && target !== 'rejected') {
      return c.json({ error: "invalid status value, must be 'approved' or 'rejected'" }, 400)
    }
    const targetStatus: Exclude<VisitorStatus, 'pending'> = target

    const result = await db.transaction(async (tx) => {
      const current = await tx.queryOne<VisitorRow>({ text: 'SELECT * FROM visitors WHERE id = ?', params: [id] })
      if (!current) return { kind: 'not_found' as const }
      if (current.status !== 'pending') return { kind: 'already_processed' as const }
      await tx.run({
        text: "UPDATE visitors SET status = ?, updated_at = CURRENT_TIMESTAMP, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        params: [targetStatus, id],
      })
      const updated = await tx.queryOne<VisitorRow>({ text: 'SELECT * FROM visitors WHERE id = ?', params: [id] })
      return { kind: 'updated' as const, visitor: updated }
    })

    if (result.kind === 'not_found') return c.json({ error: 'visitor not found' }, 404)
    if (result.kind === 'already_processed') return c.json({ error: 'visitor record has already been processed' }, 400)
    if (!result.visitor) return c.json({ error: 'failed to read updated visitor record' }, 500)
    return c.json(toVisitor(result.visitor), 200)
  })
}

// 业务路由在认证边界后注册；platform 包含已选模块的运行时资源。
export function registerProtectedRoutes(_app: Hono, _platform: Platform) {}
