import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import { ApiError } from '../../shared/errors'
import type { PatrolRoute, PatrolRouteInput, PatrolPointInput } from '../../shared/types'

interface PatrolRouteRow {
  id: string
  name: string
  created_at: string
  updated_at: string
}
interface PatrolPointRow {
  id: string
  route_id: string
  name: string
  sequence_order: number
}

function validateRouteInput(body: unknown): PatrolRouteInput {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'validation_error', '请求体不能为空')
  const { name, points } = body as { name?: unknown; points?: unknown }
  if (typeof name !== 'string' || name.trim() === '') {
    throw new ApiError(400, 'validation_error', '路线名称不能为空')
  }
  if (!Array.isArray(points) || points.length < 1) {
    throw new ApiError(400, 'validation_error', '巡逻点位列表至少 1 个元素')
  }
  const cleanedPoints: PatrolPointInput[] = []
  for (const item of points) {
    if (!item || typeof item !== 'object') throw new ApiError(400, 'validation_error', '巡逻点位格式无效')
    const point = item as { name?: unknown; sequence_order?: unknown }
    if (typeof point.name !== 'string' || point.name.trim() === '') {
      throw new ApiError(400, 'validation_error', '点位名称不能为空')
    }
    if (!Number.isInteger(point.sequence_order) || (point.sequence_order as number) < 1) {
      throw new ApiError(400, 'validation_error', '点位顺序序号必须为 ≥ 1 的整数')
    }
    cleanedPoints.push({ name: point.name.trim(), sequence_order: point.sequence_order as number })
  }
  return { name: name.trim(), points: cleanedPoints }
}

function mapRoute(row: PatrolRouteRow, points: PatrolPointRow[]): PatrolRoute {
  return {
    id: row.id,
    name: row.name,
    points: points.map((p) => ({ id: p.id, name: p.name, sequence_order: p.sequence_order })),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function loadRoute(db: DbClient, id: string): Promise<PatrolRoute> {
  const route = await db.queryOne<PatrolRouteRow>({
    text: 'SELECT id, name, created_at, updated_at FROM patrol_routes WHERE id = ?',
    params: [id],
  })
  if (!route) throw new ApiError(404, 'not_found', '路线不存在')
  const points = await db.queryAll<PatrolPointRow>({
    text: 'SELECT id, route_id, name, sequence_order FROM patrol_points WHERE route_id = ? ORDER BY sequence_order, id',
    params: [id],
  })
  return mapRoute(route, points)
}

export async function listPatrolRoutes(db: DbClient): Promise<PatrolRoute[]> {
  const routes = await db.queryAll<PatrolRouteRow>({
    text: 'SELECT id, name, created_at, updated_at FROM patrol_routes ORDER BY created_at, id',
  })
  if (routes.length === 0) return []
  const points = await db.queryAll<PatrolPointRow>({
    text: 'SELECT id, route_id, name, sequence_order FROM patrol_points ORDER BY sequence_order, id',
  })
  const byRoute = new Map<string, PatrolPointRow[]>()
  for (const point of points) {
    const list = byRoute.get(point.route_id) ?? []
    list.push(point)
    byRoute.set(point.route_id, list)
  }
  return routes.map((route) => mapRoute(route, byRoute.get(route.id) ?? []))
}

export async function getPatrolRoute(db: DbClient, id: string): Promise<PatrolRoute> {
  return loadRoute(db, id)
}

export async function createPatrolRoute(db: DbClient, body: unknown): Promise<PatrolRoute> {
  const input = validateRouteInput(body)
  const id = randomUUID()
  const now = new Date().toISOString()
  return db.transaction(async (tx) => {
    await tx.run({
      text: 'INSERT INTO patrol_routes (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      params: [id, input.name, now, now],
    })
    for (const point of input.points) {
      await tx.run({
        text: 'INSERT INTO patrol_points (id, route_id, name, sequence_order, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [randomUUID(), id, point.name, point.sequence_order, now],
      })
    }
    return loadRoute(tx, id)
  })
}

export async function updatePatrolRoute(db: DbClient, id: string, body: unknown): Promise<PatrolRoute> {
  const input = validateRouteInput(body)
  const now = new Date().toISOString()
  return db.transaction(async (tx) => {
    const existing = await tx.queryOne<{ id: string }>({
      text: 'SELECT id FROM patrol_routes WHERE id = ?',
      params: [id],
    })
    if (!existing) throw new ApiError(404, 'not_found', '路线不存在')
    await tx.run({
      text: 'UPDATE patrol_routes SET name = ?, updated_at = ? WHERE id = ?',
      params: [input.name, now, id],
    })
    // 全量替换点位：删除旧点位后插入新点位（级联删除由事务保证一致）
    await tx.run({ text: 'DELETE FROM patrol_points WHERE route_id = ?', params: [id] })
    for (const point of input.points) {
      await tx.run({
        text: 'INSERT INTO patrol_points (id, route_id, name, sequence_order, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [randomUUID(), id, point.name, point.sequence_order, now],
      })
    }
    return loadRoute(tx, id)
  })
}

export async function deletePatrolRoute(db: DbClient, id: string): Promise<{ deleted: true }> {
  const result = await db.run({ text: 'DELETE FROM patrol_routes WHERE id = ?', params: [id] })
  if (result.changes === 0) throw new ApiError(404, 'not_found', '路线不存在')
  return { deleted: true }
}
