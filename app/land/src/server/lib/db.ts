/**
 * DB 访问帮助：JSON 列安全解析、公共查询与权限中间件（服务端域路由共用）。
 * 查询直接使用 DbClient/tx 的 queryOne/queryAll/run（dbkit 契约：事务回调内只用 tx）。
 */
import type { Context, Hono, MiddlewareHandler } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import type { Platform } from '../platform/bootstrap'
import { errors, currentActor } from './api'

export type Row = Record<string, unknown>

export function parseJsonColumn<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined || raw === '') return fallback
  try {
    return JSON.parse(String(raw)) as T
  } catch {
    return fallback
  }
}

export function nowIso(): string {
  return new Date().toISOString()
}

export async function requirePermission(context: Context, platform: Platform, key: string): Promise<void> {
  const actor = currentActor(context)
  try {
    await platform.permissionKit.requirePermission(actor.id, key)
  } catch (error) {
    if (error instanceof Error && error.name === 'PermissionDeniedError') throw errors.forbidden()
    throw error
  }
}

export function permissionMiddleware(platform: Platform, key: string): MiddlewareHandler {
  return async (context, next) => {
    await requirePermission(context, platform, key)
    await next()
  }
}

export async function auditEvent(
  platform: Platform,
  entry: { type: string; actorUserId?: string; objectType?: string; objectId?: string; summary?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  await platform.auditKit.record({
    type: entry.type,
    actorUserId: entry.actorUserId,
    metadata: { objectType: entry.objectType, objectId: entry.objectId, summary: entry.summary, ...entry.metadata },
  })
}

export async function loadParcel(db: DbClient, parcelId: string): Promise<Row> {
  const parcel = await db.queryOne<Row>({ text: 'SELECT * FROM parcels WHERE id = ?', params: [parcelId] })
  if (!parcel) throw errors.notFound('Parcel not found')
  return parcel
}

export async function loadPlan(db: DbClient, planId: string): Promise<Row> {
  const plan = await db.queryOne<Row>({ text: 'SELECT * FROM plans WHERE id = ?', params: [planId] })
  if (!plan) throw errors.notFound('Plan not found')
  return plan
}

/** 域路由注册器形状。 */
export type DomainRoutes = (app: Hono, platform: Platform) => void
