import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import type { CurrentUser } from '../platform/auth'
import { ApiError, forbidden, invalidRequest } from '../errors'
import { nowIso } from '../util'
import type { CategoryRuleItem, CompanyItem, GroupItem, GroupSummary } from '../../shared/contracts'

export interface CreateGroupInput {
  companyId: unknown
  name: unknown
  memberIds: unknown
}

export interface UpdateGroupInput {
  name: unknown
  memberIds: unknown
}

export interface CreateRuleInput {
  companyId: unknown
  category: unknown
  groupId: unknown
}

interface GroupRow {
  id: string
  company_id: string
  company_name: string
  name: string
  user_id: string | null
  user_name: string | null
}

function requireAdmin(user: CurrentUser) {
  if (user.role !== 'admin') throw forbidden()
}

function requireAdminOrHandler(user: CurrentUser) {
  if (user.role !== 'admin' && user.role !== 'handler') throw forbidden()
}

function readTrimmedString(value: unknown, min: number, max: number): string {
  if (typeof value !== 'string') throw invalidRequest()
  const trimmed = value.trim()
  if (trimmed.length < min || trimmed.length > max) throw invalidRequest()
  return trimmed
}

function readMemberIds(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !id.trim())) throw invalidRequest()
  const ids = value.map((id) => (id as string).trim())
  if (new Set(ids).size !== ids.length) throw invalidRequest()
  return ids.length ? ids : undefined
}

/** 配置管理域：公司列表、业务组/成员、分类分配规则（契约 §3）。 */
export function createConfigService(db: DbClient) {
  async function listCompanies(user: CurrentUser): Promise<{ items: CompanyItem[] }> {
    requireAdminOrHandler(user)
    const rows = await db.queryAll<{ id: string; name: string }>({
      text: 'SELECT id, name FROM companies ORDER BY name ASC, id ASC',
    })
    return { items: rows }
  }

  async function queryGroups(companyId: string): Promise<GroupItem[]> {
    const rows = await db.queryAll<GroupRow>({
      text: `SELECT g.id, g.company_id, c.name AS company_name, g.name, gm.user_id, u.name AS user_name
             FROM groups g
             JOIN companies c ON c.id = g.company_id
             LEFT JOIN group_members gm ON gm.group_id = g.id
             LEFT JOIN users u ON u.id = gm.user_id
             WHERE g.company_id = ?
             ORDER BY g.name, g.id, u.name`,
      params: [companyId],
    })
    const groups = new Map<string, GroupItem>()
    for (const row of rows) {
      let group = groups.get(row.id)
      if (!group) {
        group = { id: row.id, companyId: row.company_id, companyName: row.company_name, name: row.name, members: [] }
        groups.set(row.id, group)
      }
      if (row.user_id && row.user_name) {
        group.members.push({ userId: row.user_id, userName: row.user_name })
      }
    }
    return [...groups.values()]
  }

  async function queryGroupMembers(groupIds: string[]): Promise<Map<string, { userId: string; userName: string }[]>> {
    const result = new Map<string, { userId: string; userName: string }[]>()
    if (!groupIds.length) return result
    const placeholders = groupIds.map(() => '?').join(', ')
    const rows = await db.queryAll<{ group_id: string; user_id: string; user_name: string }>({
      text: `SELECT gm.group_id, gm.user_id, u.name AS user_name
             FROM group_members gm
             JOIN users u ON u.id = gm.user_id
             WHERE gm.group_id IN (${placeholders})
             ORDER BY u.name, gm.user_id`,
      params: groupIds,
    })
    for (const row of rows) {
      const members = result.get(row.group_id) ?? []
      members.push({ userId: row.user_id, userName: row.user_name })
      result.set(row.group_id, members)
    }
    return result
  }

  /** 成员须存在且属于指定公司，否则 400 invalid_member。 */
  async function assertMembersInCompany(memberIds: string[], companyId: string) {
    for (const memberId of memberIds) {
      const row = await db.queryOne<{ company_id: string | null }>({
        text: 'SELECT company_id FROM users WHERE id = ?',
        params: [memberId],
      })
      if (!row || row.company_id !== companyId) throw new ApiError(400, 'invalid_member')
    }
  }

  async function createGroup(user: CurrentUser, input: CreateGroupInput): Promise<GroupSummary> {
    requireAdmin(user)
    if (typeof input.companyId !== 'string' || !input.companyId.trim()) throw invalidRequest()
    const companyId = input.companyId.trim()
    const name = readTrimmedString(input.name, 1, 100)
    const memberIds = readMemberIds(input.memberIds)
    const company = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM companies WHERE id = ?',
      params: [companyId],
    })
    if (!company) throw new ApiError(404, 'company_not_found')
    const conflict = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM groups WHERE company_id = ? AND name = ?',
      params: [companyId, name],
    })
    if (conflict) throw new ApiError(409, 'group_name_conflict')
    if (memberIds) await assertMembersInCompany(memberIds, companyId)

    const groupId = randomUUID()
    const createdAt = nowIso()
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)',
        params: [groupId, companyId, name, createdAt],
      })
      for (const memberId of memberIds ?? []) {
        await tx.run({
          text: 'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
          params: [groupId, memberId],
        })
      }
    })
    const members = (await queryGroupMembers([groupId])).get(groupId) ?? []
    return { id: groupId, companyId, name, members }
  }

  async function listGroups(user: CurrentUser, companyId: string): Promise<{ items: GroupItem[] }> {
    requireAdminOrHandler(user)
    return { items: await queryGroups(companyId) }
  }

  async function updateGroup(user: CurrentUser, groupId: string, input: UpdateGroupInput): Promise<GroupItem> {
    requireAdmin(user)
    if (input.name === undefined && input.memberIds === undefined) throw invalidRequest()
    const group = await db.queryOne<{ id: string; company_id: string }>({
      text: 'SELECT id, company_id FROM groups WHERE id = ?',
      params: [groupId],
    })
    if (!group) throw new ApiError(404, 'group_not_found')
    const name = input.name === undefined ? undefined : readTrimmedString(input.name, 1, 100)
    const memberIds = input.memberIds === undefined ? undefined : readMemberIds(input.memberIds)
    if (name !== undefined) {
      const conflict = await db.queryOne<{ id: string }>({
        text: 'SELECT id FROM groups WHERE company_id = ? AND name = ? AND id <> ?',
        params: [group.company_id, name, groupId],
      })
      if (conflict) throw new ApiError(409, 'group_name_conflict')
    }
    if (memberIds !== undefined) await assertMembersInCompany(memberIds, group.company_id)

    await db.transaction(async (tx) => {
      if (name !== undefined) {
        await tx.run({ text: 'UPDATE groups SET name = ? WHERE id = ?', params: [name, groupId] })
      }
      if (memberIds !== undefined) {
        await tx.run({ text: 'DELETE FROM group_members WHERE group_id = ?', params: [groupId] })
        for (const memberId of memberIds) {
          await tx.run({
            text: 'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
            params: [groupId, memberId],
          })
        }
      }
    })
    const found = (await queryGroups(group.company_id)).find((g) => g.id === groupId)
    if (!found) throw new ApiError(404, 'group_not_found')
    return found
  }

  async function createRule(user: CurrentUser, input: CreateRuleInput): Promise<CategoryRuleItem> {
    requireAdmin(user)
    if (typeof input.companyId !== 'string' || !input.companyId.trim()) throw invalidRequest()
    if (typeof input.groupId !== 'string' || !input.groupId.trim()) throw invalidRequest()
    const companyId = input.companyId.trim()
    const groupId = input.groupId.trim()
    const category = readTrimmedString(input.category, 1, 50)
    const group = await db.queryOne<{ id: string; company_id: string; name: string }>({
      text: 'SELECT id, company_id, name FROM groups WHERE id = ? AND company_id = ?',
      params: [groupId, companyId],
    })
    if (!group) throw new ApiError(400, 'group_company_mismatch')
    const conflict = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM category_rules WHERE company_id = ? AND category = ?',
      params: [companyId, category],
    })
    if (conflict) throw new ApiError(409, 'rule_conflict')
    const ruleId = randomUUID()
    await db.run({
      text: 'INSERT INTO category_rules (id, company_id, category, group_id) VALUES (?, ?, ?, ?)',
      params: [ruleId, companyId, category, groupId],
    })
    return { id: ruleId, companyId, category, groupId, groupName: group.name }
  }

  async function listRules(user: CurrentUser, companyId: string): Promise<{ items: CategoryRuleItem[] }> {
    requireAdminOrHandler(user)
    const rows = await db.queryAll<{
      id: string
      company_id: string
      category: string
      group_id: string
      group_name: string
    }>({
      text: `SELECT r.id, r.company_id, r.category, r.group_id, g.name AS group_name
             FROM category_rules r
             JOIN groups g ON g.id = r.group_id
             WHERE r.company_id = ?
             ORDER BY r.category ASC`,
      params: [companyId],
    })
    return {
      items: rows.map((row) => ({
        id: row.id,
        companyId: row.company_id,
        category: row.category,
        groupId: row.group_id,
        groupName: row.group_name,
      })),
    }
  }

  async function deleteRule(user: CurrentUser, ruleId: string): Promise<void> {
    requireAdmin(user)
    const result = await db.run({ text: 'DELETE FROM category_rules WHERE id = ?', params: [ruleId] })
    if (result.changes === 0) throw new ApiError(404, 'rule_not_found')
  }

  return { listCompanies, createGroup, listGroups, updateGroup, createRule, listRules, deleteRule }
}

export type ConfigService = ReturnType<typeof createConfigService>
