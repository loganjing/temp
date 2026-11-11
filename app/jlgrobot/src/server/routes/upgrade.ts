import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import { randomUUID } from 'node:crypto'
import {
  UPGRADE_TARGET_STATUSES,
  UPGRADE_TRANSITIONS,
  type UpgradeStatusLog,
  type UpgradeTask,
} from '../../shared/contracts'
import { badRequest, notFound, readJsonBody, trimmedString } from './_helpers'

interface UpgradeRow extends UpgradeTask {}

interface UpgradeLogRow extends UpgradeStatusLog {}

async function fetchUpgrade(db: DbClient, id: string) {
  return db.queryOne<UpgradeRow>({
    text: 'SELECT id, equipment_id, package_id, status, result, failure_reason, created_at, updated_at FROM upgrade_tasks WHERE id = ?',
    params: [id],
  })
}

export function registerUpgradeRoutes(app: Hono, db: DbClient) {
  app.get('/api/upgrades', async (c) => {
    const equipmentId = trimmedString(c.req.query('equipment_id'))
    const status = trimmedString(c.req.query('status'))
    let text = 'SELECT id, equipment_id, package_id, status, result, failure_reason, created_at, updated_at FROM upgrade_tasks'
    const params: string[] = []
    const where: string[] = []
    if (equipmentId) {
      where.push('equipment_id = ?')
      params.push(equipmentId)
    }
    if (status) {
      where.push('status = ?')
      params.push(status)
    }
    if (where.length) text += ' WHERE ' + where.join(' AND ')
    text += ' ORDER BY created_at DESC'
    const items = await db.queryAll<UpgradeRow>({ text, params })
    return c.json({ items })
  })

  app.post('/api/upgrades', async (c) => {
    const body = await readJsonBody(c)
    if (!body || typeof body !== 'object') return badRequest(c, '请求体必须是合法 JSON 对象')
    const record = body as Record<string, unknown>
    const equipmentId = trimmedString(record.equipment_id)
    const packageId = trimmedString(record.package_id)
    if (!equipmentId || !packageId) return badRequest(c, 'equipment_id 和 package_id 为必填项')

    const exists = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM equipment WHERE id = ?',
      params: [equipmentId],
    })
    if (!exists) return notFound(c, '设备不存在')

    const id = randomUUID()
    const now = new Date().toISOString()
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO upgrade_tasks (id, equipment_id, package_id, status, result, failure_reason, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)',
        params: [id, equipmentId, packageId, 'pending', now, now],
      })
      await tx.run({
        text: 'INSERT INTO upgrade_status_logs (id, task_id, from_status, to_status, changed_at) VALUES (?, ?, NULL, ?, ?)',
        params: [randomUUID(), id, 'pending', now],
      })
    })
    return c.json(
      {
        id,
        equipment_id: equipmentId,
        package_id: packageId,
        status: 'pending',
        result: null,
        failure_reason: null,
        created_at: now,
        updated_at: now,
      },
      201,
    )
  })

  app.get('/api/upgrades/:id', async (c) => {
    const task = await fetchUpgrade(db, c.req.param('id'))
    if (!task) return notFound(c, '升级任务不存在')
    const status_logs = await db.queryAll<UpgradeLogRow>({
      text: 'SELECT id, task_id, from_status, to_status, changed_at FROM upgrade_status_logs WHERE task_id = ? ORDER BY changed_at ASC',
      params: [task.id],
    })
    return c.json({ ...task, status_logs })
  })

  app.post('/api/upgrades/:id/status', async (c) => {
    const task = await fetchUpgrade(db, c.req.param('id'))
    if (!task) return notFound(c, '升级任务不存在')

    const body = await readJsonBody(c)
    if (!body || typeof body !== 'object') return badRequest(c, '请求体必须是合法 JSON 对象')
    const record = body as Record<string, unknown>
    const target = trimmedString(record.status)
    if (!target) return badRequest(c, 'status 为必填项')
    if (!UPGRADE_TARGET_STATUSES.includes(target as (typeof UPGRADE_TARGET_STATUSES)[number])) {
      return badRequest(c, '目标状态非法')
    }
    const allowed = UPGRADE_TRANSITIONS[task.status]
    if (!allowed.includes(target as (typeof allowed)[number])) {
      return badRequest(c, `非法状态流转：${task.status} → ${target}`)
    }

    const resultRaw = record.result
    const result =
      resultRaw === undefined ? task.result : typeof resultRaw === 'string' || resultRaw === null ? resultRaw : task.result
    const failureRaw = record.failure_reason
    const failureReason =
      failureRaw === undefined ? task.failure_reason : typeof failureRaw === 'string' || failureRaw === null ? failureRaw : task.failure_reason

    if (target === 'failed' && !failureReason) return badRequest(c, 'failed 状态必须填写 failure_reason')

    const now = new Date().toISOString()
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'UPDATE upgrade_tasks SET status = ?, result = ?, failure_reason = ?, updated_at = ? WHERE id = ?',
        params: [target, result, failureReason, now, task.id],
      })
      await tx.run({
        text: 'INSERT INTO upgrade_status_logs (id, task_id, from_status, to_status, changed_at) VALUES (?, ?, ?, ?, ?)',
        params: [randomUUID(), task.id, task.status, target, now],
      })
    })
    return c.json({
      ...task,
      status: target,
      result,
      failure_reason: failureReason,
      updated_at: now,
    })
  })
}
