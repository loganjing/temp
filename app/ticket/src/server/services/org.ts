import { randomUUID } from 'node:crypto'
import { createPermissionKit } from '@commonapp/permissionkit'
import type { DbClient } from '@commonapp/dbkit'
import type {
  AssignmentRule,
  BusinessGroup,
  CategoryRef,
  GroupRef,
  TicketCategory,
} from '../../shared/ticket-contracts'
import { ROLE_AGENT } from '../../shared/ticket-contracts'
import { duplicateMember, duplicateName, forbidden, notFound, validationFailed } from '../errors'

type CategoryRow = { id: string; name: string; enabled: number; sort_order: number }
type GroupRow = { id: string; name: string; description: string | null; enabled: number }
type MemberRow = { id: string; name: string; email: string; department: string }
type RuleRow = { id: string; category_id: string; category_name: string; group_id: string; group_name: string; enabled: number }

const isUniqueError = (error: unknown) => error instanceof Error && /unique constraint/i.test(error.message)

export function createOrgService(db: DbClient) {
  const mapCategory = (row: CategoryRow): TicketCategory => ({
    id: row.id,
    name: row.name,
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
  })

  async function getCompany(companyId: string) {
    return db.queryOne<{ id: string; code: string; name: string }>({
      text: 'SELECT id, code, name FROM companies WHERE id = ?',
      params: [companyId],
    })
  }

  async function listCategories(companyId: string, enabledOnly = false): Promise<TicketCategory[]> {
    const rows = await db.queryAll<CategoryRow>({
      text: `SELECT id, name, enabled, sort_order FROM ticket_categories
             WHERE company_id = ?${enabledOnly ? ' AND enabled = 1' : ''}
             ORDER BY sort_order, name, id`,
      params: [companyId],
    })
    return rows.map(mapCategory)
  }

  async function getCategory(companyId: string, categoryId: string): Promise<TicketCategory | null> {
    const row = await db.queryOne<CategoryRow>({
      text: 'SELECT id, name, enabled, sort_order FROM ticket_categories WHERE company_id = ? AND id = ?',
      params: [companyId, categoryId],
    })
    return row ? mapCategory(row) : null
  }

  async function categoryBelongsToAnotherCompany(categoryId: string): Promise<boolean> {
    return Boolean(await db.queryOne({ text: 'SELECT id FROM ticket_categories WHERE id = ?', params: [categoryId] }))
  }

  async function createCategory(companyId: string, input: { name: string; sortOrder?: number }): Promise<TicketCategory> {
    const now = new Date().toISOString()
    const nextSort = await db.queryOne<{ next: number }>({
      text: 'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM ticket_categories WHERE company_id = ?',
      params: [companyId],
    })
    const id = randomUUID()
    try {
      await db.run({
        text: `INSERT INTO ticket_categories (id, company_id, name, enabled, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, 1, ?, ?, ?)`,
        params: [id, companyId, input.name, input.sortOrder ?? Number(nextSort?.next ?? 1), now, now],
      })
    } catch (error) {
      if (isUniqueError(error)) throw duplicateName('同名分类已存在')
      throw error
    }
    const created = await getCategory(companyId, id)
    if (!created) throw notFound('分类不存在')
    return created
  }

  async function updateCategory(
    companyId: string,
    categoryId: string,
    input: { name?: string; enabled?: boolean; sortOrder?: number },
  ): Promise<TicketCategory> {
    const existing = await getCategory(companyId, categoryId)
    if (!existing) {
      if (await categoryBelongsToAnotherCompany(categoryId)) throw forbidden('不能修改其他公司的分类')
      throw notFound('分类不存在')
    }
    const fields: string[] = []
    const params: unknown[] = []
    if (input.name !== undefined) {
      fields.push('name = ?')
      params.push(input.name)
    }
    if (input.enabled !== undefined) {
      fields.push('enabled = ?')
      params.push(input.enabled ? 1 : 0)
    }
    if (input.sortOrder !== undefined) {
      fields.push('sort_order = ?')
      params.push(input.sortOrder)
    }
    fields.push('updated_at = ?')
    params.push(new Date().toISOString(), companyId, categoryId)
    try {
      await db.run({ text: `UPDATE ticket_categories SET ${fields.join(', ')} WHERE company_id = ? AND id = ?`, params })
    } catch (error) {
      if (isUniqueError(error)) throw duplicateName('同名分类已存在')
      throw error
    }
    const updated = await getCategory(companyId, categoryId)
    if (!updated) throw notFound('分类不存在')
    return updated
  }

  async function listGroups(companyId: string, options: { enabledOnly?: boolean; withMembers?: boolean } = {}): Promise<BusinessGroup[]> {
    const rows = await db.queryAll<GroupRow>({
      text: `SELECT id, name, description, enabled FROM business_groups
             WHERE company_id = ?${options.enabledOnly ? ' AND enabled = 1' : ''}
             ORDER BY name, id`,
      params: [companyId],
    })
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        enabled: Boolean(row.enabled),
        members: options.withMembers === false ? [] : await listGroupMembers(companyId, row.id),
      })),
    )
  }

  async function listGroupMembers(companyId: string, groupId: string): Promise<MemberRow[]> {
    return db.queryAll<MemberRow>({
      text: `SELECT u.id, u.name, u.email, p.department
             FROM business_group_members m
             JOIN users u ON u.id = m.user_id
             JOIN user_profiles p ON p.user_id = u.id AND p.company_id = m.company_id
             WHERE m.group_id = ? AND m.company_id = ?
             ORDER BY u.name, u.id`,
      params: [groupId, companyId],
    })
  }

  async function getGroup(companyId: string, groupId: string): Promise<BusinessGroup | null> {
    const row = await db.queryOne<GroupRow>({
      text: 'SELECT id, name, description, enabled FROM business_groups WHERE company_id = ? AND id = ?',
      params: [companyId, groupId],
    })
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      enabled: Boolean(row.enabled),
      members: await listGroupMembers(companyId, row.id),
    }
  }

  async function groupBelongsToAnotherCompany(groupId: string): Promise<boolean> {
    return Boolean(await db.queryOne({ text: 'SELECT id FROM business_groups WHERE id = ?', params: [groupId] }))
  }

  async function createGroup(companyId: string, input: { name: string; description?: string | null }): Promise<BusinessGroup> {
    const now = new Date().toISOString()
    const id = randomUUID()
    try {
      await db.run({
        text: `INSERT INTO business_groups (id, company_id, name, description, enabled, created_at, updated_at)
               VALUES (?, ?, ?, ?, 1, ?, ?)`,
        params: [id, companyId, input.name, input.description ?? null, now, now],
      })
    } catch (error) {
      if (isUniqueError(error)) throw duplicateName('同名业务组已存在')
      throw error
    }
    const created = await getGroup(companyId, id)
    if (!created) throw notFound('业务组不存在')
    return created
  }

  async function updateGroup(
    companyId: string,
    groupId: string,
    input: { name?: string; description?: string | null; enabled?: boolean },
  ): Promise<BusinessGroup> {
    const existing = await getGroup(companyId, groupId)
    if (!existing) {
      if (await groupBelongsToAnotherCompany(groupId)) throw forbidden('不能修改其他公司的业务组')
      throw notFound('业务组不存在')
    }
    const fields: string[] = []
    const params: unknown[] = []
    if (input.name !== undefined) {
      fields.push('name = ?')
      params.push(input.name)
    }
    if (input.description !== undefined) {
      fields.push('description = ?')
      params.push(input.description)
    }
    if (input.enabled !== undefined) {
      fields.push('enabled = ?')
      params.push(input.enabled ? 1 : 0)
    }
    fields.push('updated_at = ?')
    params.push(new Date().toISOString(), companyId, groupId)
    try {
      await db.run({ text: `UPDATE business_groups SET ${fields.join(', ')} WHERE company_id = ? AND id = ?`, params })
    } catch (error) {
      if (isUniqueError(error)) throw duplicateName('同名业务组已存在')
      throw error
    }
    const updated = await getGroup(companyId, groupId)
    if (!updated) throw notFound('业务组不存在')
    return updated
  }

  async function isGroupMember(companyId: string, groupId: string, userId: string): Promise<boolean> {
    return Boolean(
      await db.queryOne({
        text: 'SELECT 1 AS found FROM business_group_members WHERE company_id = ? AND group_id = ? AND user_id = ?',
        params: [companyId, groupId, userId],
      }),
    )
  }

  async function addGroupMember(companyId: string, groupId: string, userId: string): Promise<MemberRow> {
    const group = await getGroup(companyId, groupId)
    if (!group) {
      if (await groupBelongsToAnotherCompany(groupId)) throw forbidden('不能修改其他公司的业务组')
      throw notFound('业务组不存在')
    }
    const user = await db.queryOne<MemberRow & { company_id: string }>({
      text: `SELECT u.id, u.name, u.email, p.department, p.company_id
             FROM users u JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?`,
      params: [userId],
    })
    if (!user || user.company_id !== companyId) {
      throw validationFailed('提交内容有误，请检查后重试', { userId: '只能添加本公司的用户' })
    }
    if (await isGroupMember(companyId, groupId, userId)) throw duplicateMember()
    try {
      await db.transaction(async (tx) => {
        await tx.run({
          text: 'INSERT INTO business_group_members (group_id, user_id, company_id, created_at) VALUES (?, ?, ?, ?)',
          params: [groupId, userId, companyId, new Date().toISOString()],
        })
        await createPermissionKit(tx).assignRole(userId, ROLE_AGENT, { type: 'company', id: companyId })
      })
    } catch (error) {
      if (isUniqueError(error)) throw duplicateMember()
      throw error
    }
    return { id: user.id, name: user.name, email: user.email, department: user.department }
  }

  async function removeGroupMember(companyId: string, groupId: string, userId: string): Promise<void> {
    const group = await getGroup(companyId, groupId)
    if (!group) {
      if (await groupBelongsToAnotherCompany(groupId)) throw forbidden('不能修改其他公司的业务组')
      throw notFound('业务组不存在')
    }
    if (!(await isGroupMember(companyId, groupId, userId))) throw notFound('成员不存在')
    // permissionkit.revokeRole 自身开启事务，dbkit 不支持嵌套事务，故移除成员与角色回收按顺序执行。
    await db.run({
      text: 'DELETE FROM business_group_members WHERE group_id = ? AND user_id = ? AND company_id = ?',
      params: [groupId, userId, companyId],
    })
    const remaining = await db.queryOne<{ total: number }>({
      text: 'SELECT COUNT(*) AS total FROM business_group_members WHERE company_id = ? AND user_id = ?',
      params: [companyId, userId],
    })
    if (Number(remaining?.total ?? 0) === 0) {
      await createPermissionKit(db).revokeRole(userId, ROLE_AGENT, { type: 'company', id: companyId })
    }
  }

  async function listRules(companyId: string): Promise<AssignmentRule[]> {
    const rows = await db.queryAll<RuleRow>({
      text: `SELECT r.id, r.category_id, c.name AS category_name, r.group_id, g.name AS group_name, r.enabled
             FROM assignment_rules r
             JOIN ticket_categories c ON c.id = r.category_id
             JOIN business_groups g ON g.id = r.group_id
             WHERE r.company_id = ?
             ORDER BY c.sort_order, c.name, r.id`,
      params: [companyId],
    })
    return rows.map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      groupId: row.group_id,
      groupName: row.group_name,
      enabled: Boolean(row.enabled),
    }))
  }

  async function upsertRule(
    companyId: string,
    input: { categoryId: string; groupId: string; enabled: boolean },
  ): Promise<AssignmentRule> {
    const category = await getCategory(companyId, input.categoryId)
    if (!category) {
      throw validationFailed('提交内容有误，请检查后重试', { categoryId: '分类不属于当前公司' })
    }
    const group = await getGroup(companyId, input.groupId)
    if (!group) {
      throw validationFailed('提交内容有误，请检查后重试', { groupId: '业务组不属于当前公司' })
    }
    const now = new Date().toISOString()
    const existing = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM assignment_rules WHERE company_id = ? AND category_id = ?',
      params: [companyId, input.categoryId],
    })
    if (existing) {
      await db.run({
        text: 'UPDATE assignment_rules SET group_id = ?, enabled = ?, updated_at = ? WHERE company_id = ? AND category_id = ?',
        params: [input.groupId, input.enabled ? 1 : 0, now, companyId, input.categoryId],
      })
    } else {
      await db.run({
        text: `INSERT INTO assignment_rules (id, company_id, category_id, group_id, enabled, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params: [randomUUID(), companyId, input.categoryId, input.groupId, input.enabled ? 1 : 0, now, now],
      })
    }
    const rule = await db.queryOne<RuleRow>({
      text: `SELECT r.id, r.category_id, c.name AS category_name, r.group_id, g.name AS group_name, r.enabled
             FROM assignment_rules r
             JOIN ticket_categories c ON c.id = r.category_id
             JOIN business_groups g ON g.id = r.group_id
             WHERE r.company_id = ? AND r.category_id = ?`,
      params: [companyId, input.categoryId],
    })
    if (!rule) throw notFound('分配规则不存在')
    return {
      id: rule.id,
      categoryId: rule.category_id,
      categoryName: rule.category_name,
      groupId: rule.group_id,
      groupName: rule.group_name,
      enabled: Boolean(rule.enabled),
    }
  }

  async function resolveAssignmentGroup(companyId: string, categoryId: string): Promise<string | null> {
    const row = await db.queryOne<{ group_id: string }>({
      text: `SELECT r.group_id
             FROM assignment_rules r
             JOIN business_groups g ON g.id = r.group_id
             WHERE r.company_id = ? AND r.category_id = ? AND r.enabled = 1 AND g.enabled = 1`,
      params: [companyId, categoryId],
    })
    return row?.group_id ?? null
  }

  async function listReference(companyId: string): Promise<{ categories: CategoryRef[]; groups: GroupRef[] }> {
    const categories = await listCategories(companyId, true)
    const groups = await listGroups(companyId, { enabledOnly: true })
    return {
      categories: categories.map((category) => ({ id: category.id, name: category.name, sortOrder: category.sortOrder })),
      groups: groups.map((group) => ({ id: group.id, name: group.name })),
    }
  }

  return {
    getCompany,
    listCategories,
    getCategory,
    createCategory,
    updateCategory,
    listGroups,
    getGroup,
    createGroup,
    updateGroup,
    isGroupMember,
    addGroupMember,
    removeGroupMember,
    listRules,
    upsertRule,
    resolveAssignmentGroup,
    listReference,
  }
}

export type OrgService = ReturnType<typeof createOrgService>
