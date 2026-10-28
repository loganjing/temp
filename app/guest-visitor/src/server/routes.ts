import { randomUUID } from 'node:crypto'
import type { Context, Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import type { ApiError } from '../shared/visitor-types'
import {
  createVisitor,
  findVisitorById,
  listVisitors,
  reviewVisitor,
  ReviewConflictError,
} from './visitor-repository'
import { validateCreateVisitor, validateReviewComment } from './visitor-validation'

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 20

function errorResponse(c: Context, status: 400 | 404 | 500, code: string, message: string) {
  return c.json({ error: { code, message } } satisfies ApiError, status)
}

interface Platform {
  db: DbClient
  close: () => Promise<void>
}

// 访客登记为公开端点；审批操作无认证要求，按当前阶段契约直接注册在公开路由。
export function registerPublicRoutes(app: Hono, platform: Platform) {
  const { db } = platform

  // POST /api/visitors — 创建访客登记
  app.post('/api/visitors', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return errorResponse(c, 400, 'VALIDATION_ERROR', '请求体必须是合法 JSON')
    }
    const result = validateCreateVisitor(body)
    if (!result.ok || !result.value) {
      return errorResponse(c, 400, 'VALIDATION_ERROR', result.message ?? '请求参数校验失败')
    }
    const record = await createVisitor(db, { ...result.value, id: randomUUID() })
    return c.json(record, 201)
  })

  // GET /api/visitors — 分页查询访客列表
  app.get('/api/visitors', async (c) => {
    const statusParam = c.req.query('status')
    if (statusParam !== undefined && !['pending', 'approved', 'rejected'].includes(statusParam)) {
      return errorResponse(c, 400, 'VALIDATION_ERROR', 'status 筛选值必须为 pending/approved/rejected')
    }
    const page = parsePagination(c.req.query('page'), 1)
    const limit = parsePagination(c.req.query('limit'), DEFAULT_LIMIT, MAX_LIMIT)
    if (page < 1) return errorResponse(c, 400, 'VALIDATION_ERROR', 'page 必须 >= 1')
    if (limit < 1) return errorResponse(c, 400, 'VALIDATION_ERROR', 'limit 必须 >= 1')

    const { items, total } = await listVisitors(db, { status: statusParam, page, limit })
    return c.json({ items, total, page, limit })
  })

  // GET /api/visitors/:id — 查询访客详情
  app.get('/api/visitors/:id', async (c) => {
    const visitor = await findVisitorById(db, c.req.param('id'))
    if (!visitor) return errorResponse(c, 404, 'NOT_FOUND', '访客记录不存在')
    return c.json(visitor)
  })

  // POST /api/visitors/:id/approve — 审批通过
  app.post('/api/visitors/:id/approve', async (c) => {
    return handleReview(c, db, c.req.param('id'), 'approved')
  })

  // POST /api/visitors/:id/reject — 审批驳回
  app.post('/api/visitors/:id/reject', async (c) => {
    return handleReview(c, db, c.req.param('id'), 'rejected')
  })
}

// 业务路由在认证边界后注册；platform 包含已选模块的运行时资源。
export function registerProtectedRoutes(_app: Hono, _platform: Platform) {}

async function handleReview(
  c: Context,
  db: DbClient,
  id: string,
  targetStatus: 'approved' | 'rejected',
) {
  const existing = await findVisitorById(db, id)
  if (!existing) return errorResponse(c, 404, 'NOT_FOUND', '访客记录不存在')

  let comment: string | null = null
  const body = await c.req.json().catch(() => null)
  const result = validateReviewComment(body)
  if (!result.ok || !result.value) {
    return errorResponse(c, 400, 'VALIDATION_ERROR', result.message ?? '审批意见校验失败')
  }
  comment = result.value.comment

  try {
    const response = await reviewVisitor(db, id, targetStatus, comment)
    return c.json(response)
  } catch (error) {
    if (error instanceof ReviewConflictError) {
      return errorResponse(c, 400, 'VALIDATION_ERROR', '当前状态非 pending，不可重复审批')
    }
    throw error
  }
}

function parsePagination(raw: string | undefined, fallback: number, max?: number): number {
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || !Number.isInteger(value)) return -1
  if (max !== undefined && value > max) return max
  return value
}
