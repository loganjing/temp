/**
 * 访客数据访问层。
 *
 * 封装 visitors 表的 CRUD 操作，使用 dbkit DbClient 的 queryOne/queryAll/run。
 * SQL 使用 ? 占位符，参数通过 params 传递。
 * 负责 snake_case（数据库列）↔ camelCase（API JSON）字段转换。
 */
import type { DbClient } from '@commonapp/dbkit'
import type {
  CreateVisitorRequest,
  ReviewVisitorResponse,
  VisitorCreateResponse,
  VisitorDetail,
  VisitorListItem,
  VisitorStatus,
} from '../shared/visitor-types'

/** 数据库行（snake_case 列名） */
interface VisitorRow {
  id: string
  name: string
  phone: string
  id_card: string
  company: string
  visit_reason: string
  host_name: string
  expected_visit_time: string
  photo_url: string | null
  status: string
  review_comment: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

function rowToDetail(row: VisitorRow): VisitorDetail {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    idCard: row.id_card,
    company: row.company,
    visitReason: row.visit_reason,
    hostName: row.host_name,
    expectedVisitTime: row.expected_visit_time,
    photoUrl: row.photo_url,
    status: row.status as VisitorStatus,
    reviewComment: row.review_comment,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToCreateResponse(row: VisitorRow): VisitorCreateResponse {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    idCard: row.id_card,
    company: row.company,
    visitReason: row.visit_reason,
    hostName: row.host_name,
    expectedVisitTime: row.expected_visit_time,
    photoUrl: row.photo_url,
    status: row.status as VisitorStatus,
    createdAt: row.created_at,
  }
}

function rowToListItem(row: VisitorRow): VisitorListItem {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    company: row.company,
    hostName: row.host_name,
    expectedVisitTime: row.expected_visit_time,
    status: row.status as VisitorStatus,
    createdAt: row.created_at,
  }
}

/** 创建访客登记记录，返回创建响应（status=pending） */
export async function createVisitor(
  db: DbClient,
  input: CreateVisitorRequest & { id: string },
): Promise<VisitorCreateResponse> {
  const now = new Date().toISOString()
  await db.run({
    text: `INSERT INTO visitors
      (id, name, phone, id_card, company, visit_reason, host_name, expected_visit_time, photo_url, status, review_comment, reviewed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?)`,
    params: [
      input.id,
      input.name,
      input.phone,
      input.idCard,
      input.company,
      input.visitReason,
      input.hostName,
      input.expectedVisitTime,
      input.photoUrl ?? null,
      now,
      now,
    ],
  })
  const row = await db.queryOne<VisitorRow>({
    text: 'SELECT * FROM visitors WHERE id = ?',
    params: [input.id],
  })
  if (!row) throw new Error('访客记录写入后立即读取失败')
  return rowToCreateResponse(row)
}

/** 按主键查询单条访客详情，不存在返回 null */
export async function findVisitorById(db: DbClient, id: string): Promise<VisitorDetail | null> {
  const row = await db.queryOne<VisitorRow>({
    text: 'SELECT * FROM visitors WHERE id = ?',
    params: [id],
  })
  return row ? rowToDetail(row) : null
}

/** 分页查询访客列表，支持 status 筛选 */
export async function listVisitors(
  db: DbClient,
  options: { status?: string; page: number; limit: number },
): Promise<{ items: VisitorListItem[]; total: number }> {
  const { status, page, limit } = options
  const offset = (page - 1) * limit

  const listColumns =
    'id, name, phone, company, host_name, expected_visit_time, status, created_at'

  if (status) {
    const rows = await db.queryAll<VisitorRow>({
      text: `SELECT ${listColumns} FROM visitors WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      params: [status, limit, offset],
    })
    const totalRow = await db.queryOne<{ total: number }>({
      text: 'SELECT COUNT(*) AS total FROM visitors WHERE status = ?',
      params: [status],
    })
    return { items: rows.map(rowToListItem), total: totalRow?.total ?? 0 }
  }

  const rows = await db.queryAll<VisitorRow>({
    text: `SELECT ${listColumns} FROM visitors ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    params: [limit, offset],
  })
  const totalRow = await db.queryOne<{ total: number }>({
    text: 'SELECT COUNT(*) AS total FROM visitors',
  })
  return { items: rows.map(rowToListItem), total: totalRow?.total ?? 0 }
}

/** 将 pending 访客更新为 approved/rejected，返回审批响应。调用方需先确认记录存在且为 pending。 */
export async function reviewVisitor(
  db: DbClient,
  id: string,
  targetStatus: 'approved' | 'rejected',
  comment: string | null,
): Promise<ReviewVisitorResponse> {
  const now = new Date().toISOString()
  const result = await db.run({
    text: `UPDATE visitors
      SET status = ?, review_comment = ?, reviewed_at = ?, updated_at = ?
      WHERE id = ? AND status = 'pending'`,
    params: [targetStatus, comment, now, now, id],
  })
  if (result.changes === 0) {
    throw new ReviewConflictError(id, targetStatus)
  }
  return { id, status: targetStatus, reviewComment: comment, reviewedAt: now }
}

/** reviewVisitor 在状态非 pending 时抛出，由路由层映射为 400 VALIDATION_ERROR */
export class ReviewConflictError extends Error {
  readonly visitorId: string
  readonly targetStatus: string
  constructor(visitorId: string, targetStatus: string) {
    super(`访客记录当前状态非 pending，不可重复审批`)
    this.name = 'ReviewConflictError'
    this.visitorId = visitorId
    this.targetStatus = targetStatus
  }
}
