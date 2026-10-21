/**
 * assignment 模块：业务组与成员、"分类 → 业务组"自动分配规则维护、人工分配（契约第 4 节）。
 * 写操作一律限本公司；读默认本公司，跨公司视角可用 companyId 跨公司读。
 */
import type { Hono } from 'hono'
import { isTicketCategory } from '../../shared/domain'
import type { PlatformResources } from '../platform/bootstrap'
import { recordTicketAudit } from '../audit-log'
import {
  ApiError,
  currentProfile,
  isUniqueViolation,
  pathId,
  requiredInteger,
  requiredString,
  resolveCompanyFilter,
  route,
} from '../http'
import { assembleGroups, assembleTickets, TICKET_COLUMNS, type GroupRow, type TicketRow } from '../views'

async function loadGroup(db: PlatformResources['db'], groupId: number): Promise<GroupRow> {
  const row = await db.queryOne<GroupRow>({
    text: 'SELECT id, company_id, name, created_at FROM groups WHERE id = ?',
    params: [groupId],
  })
  if (!row) throw new ApiError(404, 'NOT_FOUND', '业务组不存在')
  return row
}

function assertGroupCompany(group: GroupRow, companyId: number): void {
  if (group.company_id !== companyId) throw new ApiError(403, 'COMPANY_FORBIDDEN', '无权维护其他公司的业务组')
}

/** 成员必须全部属于本公司（契约 4.2）。 */
async function assertMembersInCompany(db: PlatformResources['db'], memberIds: number[], companyId: number): Promise<void> {
  if (memberIds.length === 0) return
  const placeholders = memberIds.map(() => '?').join(', ')
  const row = await db.queryOne<{ total: number }>({
    text: `SELECT COUNT(*) AS total FROM user_profiles WHERE company_id = ? AND id IN (${placeholders})`,
    params: [companyId, ...memberIds],
  })
  if (Number(row?.total ?? 0) !== memberIds.length) {
    throw new ApiError(400, 'VALIDATION_ERROR', '成员必须属于本公司')
  }
}

async function replaceMembers(db: PlatformResources['db'], groupId: number, memberIds: number[]): Promise<void> {
  await db.run({ text: 'DELETE FROM group_members WHERE group_id = ?', params: [groupId] })
  for (const memberId of memberIds) {
    await db.run({ text: 'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)', params: [groupId, memberId] })
  }
}

function parseMemberIds(value: unknown): number[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new ApiError(400, 'VALIDATION_ERROR', 'memberIds 需为用户 ID 数组')
  const ids = value.map((item) => {
    if (typeof item !== 'number' || !Number.isInteger(item) || item < 1) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'memberIds 需为正整数数组')
    }
    return item
  })
  if (new Set(ids).size !== ids.length) throw new ApiError(400, 'VALIDATION_ERROR', 'memberIds 不能包含重复用户')
  return ids
}

export function registerAssignmentRoutes(app: Hono, platform: PlatformResources): void {
  const { db, audit } = platform

  // 契约 4.1：业务组列表（含成员）。
  app.get(
    '/api/groups',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const companyId = resolveCompanyFilter(context, me)
      const rows = await db.queryAll<GroupRow>({
        text: 'SELECT id, company_id, name, created_at FROM groups WHERE company_id = ? ORDER BY name, id',
        params: [companyId],
      })
      return context.json(await assembleGroups(db, rows))
    }),
  )

  // 契约 4.2：创建业务组并设置成员。
  app.post(
    '/api/groups',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const body = (await context.req.json().catch(() => ({}))) as Record<string, unknown>
      const name = requiredString(body.name, '业务组名称', 100)
      const memberIds = parseMemberIds(body.memberIds)
      await assertMembersInCompany(db, memberIds, me.companyId)
      let group: GroupRow
      try {
        group = await db.transaction(async (tx) => {
          const created = await tx.queryOne<GroupRow>({
            text: 'INSERT INTO groups (company_id, name, created_at) VALUES (?, ?, ?) RETURNING id, company_id, name, created_at',
            params: [me.companyId, name, new Date().toISOString()],
          })
          if (!created) throw new ApiError(500, 'INTERNAL_ERROR', '创建业务组失败')
          for (const memberId of memberIds) {
            await tx.run({ text: 'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)', params: [created.id, memberId] })
          }
          return created
        })
      } catch (error) {
        if (isUniqueViolation(error)) throw new ApiError(409, 'GROUP_NAME_CONFLICT', '同名业务组已存在')
        throw error
      }
      const [dto] = await assembleGroups(db, [group])
      return context.json(dto, 201)
    }),
  )

  // 契约 4.3：更新业务组（名称可选；memberIds 传入时整组替换）。
  app.put(
    '/api/groups/:id',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const group = await loadGroup(db, pathId(context.req.param('id')))
      assertGroupCompany(group, me.companyId)
      const body = (await context.req.json().catch(() => ({}))) as Record<string, unknown>
      let name = group.name
      if (body.name !== undefined && body.name !== null) name = requiredString(body.name, '业务组名称', 100)
      const replaceMemberIds = body.memberIds === undefined ? null : parseMemberIds(body.memberIds)
      if (replaceMemberIds) await assertMembersInCompany(db, replaceMemberIds, me.companyId)
      try {
        await db.transaction(async (tx) => {
          await tx.run({ text: 'UPDATE groups SET name = ? WHERE id = ?', params: [name, group.id] })
          if (replaceMemberIds) await replaceMembers(tx, group.id, replaceMemberIds)
        })
      } catch (error) {
        if (isUniqueViolation(error)) throw new ApiError(409, 'GROUP_NAME_CONFLICT', '同名业务组已存在')
        throw error
      }
      const [dto] = await assembleGroups(db, [{ ...group, name }])
      return context.json(dto)
    }),
  )

  // 契约 4.4：删除业务组（被规则或未结束工单引用时拒绝）。
  app.delete(
    '/api/groups/:id',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const group = await loadGroup(db, pathId(context.req.param('id')))
      assertGroupCompany(group, me.companyId)
      const ruleRefs = await db.queryOne<{ total: number }>({
        text: 'SELECT COUNT(*) AS total FROM assignment_rules WHERE target_group_id = ?',
        params: [group.id],
      })
      const activeTicketRefs = await db.queryOne<{ total: number }>({
        text: "SELECT COUNT(*) AS total FROM tickets WHERE assigned_group_id = ? AND status IN ('created', 'pending_assignment', 'pending_processing')",
        params: [group.id],
      })
      if (Number(ruleRefs?.total ?? 0) > 0 || Number(activeTicketRefs?.total ?? 0) > 0) {
        throw new ApiError(409, 'GROUP_IN_USE', '业务组仍被分配规则或未结束工单引用，请先删除规则或处理相关工单')
      }
      await db.transaction(async (tx) => {
        await tx.run({ text: 'DELETE FROM group_members WHERE group_id = ?', params: [group.id] })
        await tx.run({ text: 'DELETE FROM groups WHERE id = ?', params: [group.id] })
      })
      return context.body(null, 204)
    }),
  )

  // 契约 4.5：分配规则列表。
  app.get(
    '/api/assignment-rules',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const companyId = resolveCompanyFilter(context, me)
      const rows = await db.queryAll<{
        id: number
        company_id: number
        category: string
        target_group_id: number
        target_group_name: string
        created_at: string
      }>({
        text: `SELECT r.id, r.company_id, r.category, r.target_group_id, g.name AS target_group_name, r.created_at
               FROM assignment_rules r JOIN groups g ON g.id = r.target_group_id
               WHERE r.company_id = ? ORDER BY r.category, r.id`,
        params: [companyId],
      })
      return context.json(
        rows.map((row) => ({
          id: row.id,
          companyId: row.company_id,
          category: row.category,
          targetGroupId: row.target_group_id,
          targetGroupName: row.target_group_name,
          createdAt: row.created_at,
        })),
      )
    }),
  )

  // 契约 4.6：创建分配规则（公司 + 分类唯一）。
  app.post(
    '/api/assignment-rules',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const body = (await context.req.json().catch(() => ({}))) as Record<string, unknown>
      if (!isTicketCategory(body.category)) throw new ApiError(400, 'VALIDATION_ERROR', '分类不在字典内')
      const targetGroupId = requiredInteger(body.targetGroupId, 'targetGroupId')
      const group = await db.queryOne<{ id: number; name: string }>({
        text: 'SELECT id, name FROM groups WHERE id = ? AND company_id = ?',
        params: [targetGroupId, me.companyId],
      })
      if (!group) throw new ApiError(400, 'VALIDATION_ERROR', '目标业务组不存在或不属于本公司')
      const category = body.category as string
      let created: { id: number; created_at: string }
      try {
        created = await db.transaction(async (tx) => {
          const row = await tx.queryOne<{ id: number; created_at: string }>({
            text: 'INSERT INTO assignment_rules (company_id, category, target_group_id, created_at) VALUES (?, ?, ?, ?) RETURNING id, created_at',
            params: [me.companyId, category, targetGroupId, new Date().toISOString()],
          })
          if (!row) throw new ApiError(500, 'INTERNAL_ERROR', '创建分配规则失败')
          return row
        })
      } catch (error) {
        if (isUniqueViolation(error)) throw new ApiError(409, 'RULE_CONFLICT', '本公司该分类已存在分配规则')
        throw error
      }
      return context.json(
        {
          id: created.id,
          companyId: me.companyId,
          category,
          targetGroupId,
          targetGroupName: group.name,
          createdAt: created.created_at,
        },
        201,
      )
    }),
  )

  // 契约 4.7：删除分配规则。
  app.delete(
    '/api/assignment-rules/:id',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const ruleId = pathId(context.req.param('id'))
      const rule = await db.queryOne<{ id: number; company_id: number }>({
        text: 'SELECT id, company_id FROM assignment_rules WHERE id = ?',
        params: [ruleId],
      })
      if (!rule) throw new ApiError(404, 'NOT_FOUND', '分配规则不存在')
      if (rule.company_id !== me.companyId) throw new ApiError(403, 'COMPANY_FORBIDDEN', '无权维护其他公司的分配规则')
      await db.run({ text: 'DELETE FROM assignment_rules WHERE id = ?', params: [ruleId] })
      return context.body(null, 204)
    }),
  )

  // 契约 4.8：人工分配（自动分配未命中的兜底，R1）。
  app.post(
    '/api/tickets/:id/assign',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const ticketId = pathId(context.req.param('id'))
      const ticket = await db.queryOne<TicketRow>({
        text: `SELECT ${TICKET_COLUMNS} FROM tickets WHERE id = ?`,
        params: [ticketId],
      })
      if (!ticket) throw new ApiError(404, 'NOT_FOUND', '工单不存在')
      if (ticket.company_id !== me.companyId) throw new ApiError(403, 'COMPANY_FORBIDDEN', '无权访问其他公司的工单')
      if (ticket.status !== 'pending_assignment') throw new ApiError(409, 'STATE_CONFLICT', '工单当前状态不可分配')
      const body = (await context.req.json().catch(() => ({}))) as Record<string, unknown>
      const groupId = requiredInteger(body.groupId, 'groupId')
      const group = await db.queryOne<{ id: number; name: string }>({
        text: 'SELECT id, name FROM groups WHERE id = ? AND company_id = ?',
        params: [groupId, me.companyId],
      })
      if (!group) throw new ApiError(400, 'VALIDATION_ERROR', '业务组不存在或不属于本公司')
      const assigned = await db.transaction(async (tx) => {
        const row = await tx.queryOne<TicketRow>({
          text: `UPDATE tickets SET assigned_group_id = ?, status = 'pending_processing', updated_at = ? WHERE id = ? AND status = 'pending_assignment' RETURNING ${TICKET_COLUMNS}`,
          params: [groupId, new Date().toISOString(), ticketId],
        })
        if (!row) throw new ApiError(409, 'STATE_CONFLICT', '工单当前状态不可分配')
        await recordTicketAudit(audit, {
          action: 'ticket_assigned',
          actorPlatformUserId: me.platformUserId,
          ticketId,
          companyId: me.companyId,
          detail: `人工分配到业务组「${group.name}」`,
        })
        return row
      })
      const [dto] = await assembleTickets(db, [assigned])
      return context.json(dto)
    }),
  )
}
