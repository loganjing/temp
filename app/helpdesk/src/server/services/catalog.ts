// Category catalog, subcategories and assignment rules (contract §5).
// Categories carry no assignment fields; routing lives in assignment_rules.
import type { DbClient } from '@commonapp/dbkit'
import type { Locale, Ref } from '../../shared/domain'
import { csvRowInvalid, notFound, ruleTeamDepartmentMismatch, validation } from '../core/errors'
import { localizedPair, serializeRef } from '../core/serialize'
import type { CategoryRow } from '../core/rows'
import type { SessionUser } from '../core/session'
import { csvDocument } from '../core/csv'
import { createConfigAudit, type ConfigAuditInput } from './audit'

const ADMIN_PAGE_SIZE = 20

function audit(db: DbClient, input: ConfigAuditInput): Promise<void> {
  return createConfigAudit(db).record(input)
}

function parseStatus(value: unknown, locale: Locale): number {
  if (value === 1 || value === 0) return value
  if (value === '1' || value === '0') return Number(value)
  throw validation(locale === 'zh' ? '状态不合法' : 'Invalid status', ['status'])
}

interface CategoryJoined extends CategoryRow {
  department_name_zh: string | null
  department_name_en: string | null
}

const CATEGORY_SELECT = `SELECT c.*, d.name_zh AS department_name_zh, d.name_en AS department_name_en
  FROM categories c LEFT JOIN departments d ON d.id = c.department_id`

function categoryItem(row: CategoryJoined, locale: Locale) {
  const pair = localizedPair('zh', row.name_zh, row.name_en)
  return {
    id: row.id,
    code: row.code,
    nameZh: pair.nameZh,
    nameEn: pair.nameEn,
    department: serializeRef(locale, row.department_id, row.department_name_zh, row.department_name_en),
    ticketType: row.ticket_type,
    sortOrder: row.sort_order,
    status: row.status,
  }
}

export async function listCategories(db: DbClient, page: number, locale: Locale) {
  const totalRow = await db.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM categories' })
  const rows = await db.queryAll<CategoryJoined>({
    text: `${CATEGORY_SELECT} ORDER BY c.sort_order, c.id LIMIT ? OFFSET ?`,
    params: [ADMIN_PAGE_SIZE, (page - 1) * ADMIN_PAGE_SIZE],
  })
  return {
    items: rows.map((row) => categoryItem(row, locale)),
    page,
    pageSize: ADMIN_PAGE_SIZE,
    total: Number(totalRow?.total ?? 0),
  }
}

export interface CategoryInput {
  code: string
  nameZh: string
  nameEn?: string | null
  departmentId?: number | null
  ticketType: string
  sortOrder?: number
  status?: number | string
}

function validateCategoryInput(input: CategoryInput, locale: Locale): { status: number; sortOrder: number } {
  if (!input.code?.trim()) throw validation(locale === 'zh' ? '编码必填' : 'code is required', ['code'])
  if (!input.nameZh?.trim()) throw validation(locale === 'zh' ? '中文名必填' : 'nameZh is required', ['nameZh'])
  if (input.ticketType !== 'service_request' && input.ticketType !== 'incident') {
    throw validation(locale === 'zh' ? '工单类型不合法' : 'Invalid ticketType', ['ticketType'])
  }
  const status = parseStatus(input.status ?? 1, locale)
  const sortOrder = input.sortOrder ?? 0
  if (!Number.isInteger(sortOrder)) {
    throw validation(locale === 'zh' ? '排序值不合法' : 'Invalid sortOrder', ['sortOrder'])
  }
  return { status, sortOrder }
}

export async function createCategory(db: DbClient, actor: SessionUser, input: CategoryInput, locale: Locale): Promise<void> {
  const { status, sortOrder } = validateCategoryInput(input, locale)
  const duplicate = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM categories WHERE code = ?',
    params: [input.code.trim()],
  })
  if (duplicate) throw validation(locale === 'zh' ? '分类编码已存在' : 'Category code already exists', ['code'])
  if (input.departmentId != null) {
    const department = await db.queryOne<{ id: number }>({
      text: 'SELECT id FROM departments WHERE id = ?',
      params: [input.departmentId],
    })
    if (!department) throw validation(locale === 'zh' ? '部门不存在' : 'Department does not exist', ['departmentId'])
  }
  const now = new Date().toISOString()
  await db.run({
    text: `INSERT INTO categories (code, name_zh, name_en, department_id, ticket_type, sort_order, status, is_skeleton, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    params: [
      input.code.trim(),
      input.nameZh.trim(),
      input.nameEn?.trim() ?? '',
      input.departmentId ?? null,
      input.ticketType,
      sortOrder,
      status,
      now,
      now,
    ],
  })
  await audit(db, {
    type: 'category.create',
    actorId: actor.id,
    summaryZh: `新增分类 ${input.code.trim()}`,
    summaryEn: `Category created: ${input.code.trim()}`,
  })
}

export async function updateCategory(
  db: DbClient,
  actor: SessionUser,
  id: number,
  input: Partial<CategoryInput>,
  locale: Locale,
): Promise<void> {
  const existing = await db.queryOne<CategoryRow>({ text: 'SELECT * FROM categories WHERE id = ?', params: [id] })
  if (!existing) throw notFound(locale === 'zh' ? '分类不存在' : 'Category not found')
  const merged: CategoryInput = {
    code: input.code !== undefined ? input.code : existing.code,
    nameZh: input.nameZh !== undefined ? input.nameZh : existing.name_zh,
    nameEn: input.nameEn !== undefined ? input.nameEn : existing.name_en,
    departmentId: input.departmentId !== undefined ? input.departmentId : existing.department_id,
    ticketType: input.ticketType !== undefined ? input.ticketType : existing.ticket_type,
    sortOrder: input.sortOrder !== undefined ? input.sortOrder : existing.sort_order,
    status: input.status !== undefined ? input.status : existing.status,
  }
  const { status, sortOrder } = validateCategoryInput(merged, locale)
  if (merged.code.trim() !== existing.code) {
    const duplicate = await db.queryOne<{ id: number }>({
      text: 'SELECT id FROM categories WHERE code = ? AND id != ?',
      params: [merged.code.trim(), id],
    })
    if (duplicate) throw validation(locale === 'zh' ? '分类编码已存在' : 'Category code already exists', ['code'])
  }
  if (merged.departmentId != null) {
    const department = await db.queryOne<{ id: number }>({
      text: 'SELECT id FROM departments WHERE id = ?',
      params: [merged.departmentId],
    })
    if (!department) throw validation(locale === 'zh' ? '部门不存在' : 'Department does not exist', ['departmentId'])
  }
  await db.run({
    text: `UPDATE categories SET code = ?, name_zh = ?, name_en = ?, department_id = ?, ticket_type = ?, sort_order = ?, status = ?, updated_at = ?
           WHERE id = ?`,
    params: [
      merged.code.trim(),
      merged.nameZh.trim(),
      merged.nameEn?.trim() ?? '',
      merged.departmentId ?? null,
      merged.ticketType,
      sortOrder,
      status,
      new Date().toISOString(),
      id,
    ],
  })
  await audit(db, {
    type: 'category.update',
    actorId: actor.id,
    summaryZh: `更新分类 ${existing.code}`,
    summaryEn: `Category updated: ${existing.code}`,
  })
}

export async function categoryOptions(db: DbClient, locale: Locale) {
  const categories = await db.queryAll<CategoryRow>({
    text: `SELECT * FROM categories WHERE is_skeleton = 0 AND status = 1 ORDER BY sort_order, id`,
  })
  const subcategories = await db.queryAll<{
    id: number
    code: string
    name_zh: string
    name_en: string
    category_id: number
    sort_order: number
  }>({
    text: `SELECT id, code, name_zh, name_en, category_id, sort_order FROM subcategories
           WHERE status = 1 ORDER BY sort_order, id`,
  })
  return categories.map((category) => {
    const pair = localizedPair('zh', category.name_zh, category.name_en)
    return {
      id: category.id,
      code: category.code,
      nameZh: pair.nameZh,
      nameEn: pair.nameEn,
      ticketType: category.ticket_type,
      subCategories: subcategories
        .filter((sub) => sub.category_id === category.id)
        .map((sub) => {
          const subPair = localizedPair('zh', sub.name_zh, sub.name_en)
          return { id: sub.id, code: sub.code, nameZh: subPair.nameZh, nameEn: subPair.nameEn, sortOrder: sub.sort_order }
        }),
    }
  })
}

// --- Subcategories ---

export interface SubcategoryInput {
  code: string
  nameZh: string
  nameEn?: string | null
  categoryId: number
  sortOrder?: number
  status?: number | string
}

export async function createSubcategory(db: DbClient, actor: SessionUser, input: SubcategoryInput, locale: Locale): Promise<void> {
  if (!input.code?.trim()) throw validation(locale === 'zh' ? '编码必填' : 'code is required', ['code'])
  if (!input.nameZh?.trim()) throw validation(locale === 'zh' ? '中文名必填' : 'nameZh is required', ['nameZh'])
  const category = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM categories WHERE id = ?',
    params: [input.categoryId],
  })
  if (!category) throw validation(locale === 'zh' ? '分类不存在' : 'Category does not exist', ['categoryId'])
  const duplicate = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM subcategories WHERE category_id = ? AND code = ?',
    params: [input.categoryId, input.code.trim()],
  })
  if (duplicate) throw validation(locale === 'zh' ? '同分类下二级分类编码已存在' : 'Subcategory code already exists', ['code'])
  const status = parseStatus(input.status ?? 1, locale)
  const sortOrder = input.sortOrder ?? 0
  const now = new Date().toISOString()
  await db.run({
    text: `INSERT INTO subcategories (code, name_zh, name_en, category_id, sort_order, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [input.code.trim(), input.nameZh.trim(), input.nameEn?.trim() ?? '', input.categoryId, sortOrder, status, now, now],
  })
  await audit(db, {
    type: 'subcategory.create',
    actorId: actor.id,
    summaryZh: `新增二级分类 ${input.code.trim()}`,
    summaryEn: `Subcategory created: ${input.code.trim()}`,
  })
}

export async function updateSubcategory(
  db: DbClient,
  actor: SessionUser,
  id: number,
  input: Partial<SubcategoryInput>,
  locale: Locale,
): Promise<void> {
  const existing = await db.queryOne<{ id: number; code: string; category_id: number }>({
    text: 'SELECT id, code, category_id FROM subcategories WHERE id = ?',
    params: [id],
  })
  if (!existing) throw notFound(locale === 'zh' ? '二级分类不存在' : 'Subcategory not found')
  const updates: string[] = []
  const params: unknown[] = []
  if (input.nameZh !== undefined) {
    if (!input.nameZh.trim()) throw validation(locale === 'zh' ? '中文名必填' : 'nameZh is required', ['nameZh'])
    updates.push('name_zh = ?')
    params.push(input.nameZh.trim())
  }
  if (input.nameEn !== undefined) {
    updates.push('name_en = ?')
    params.push(input.nameEn?.trim() ?? '')
  }
  if (input.sortOrder !== undefined) {
    if (!Number.isInteger(input.sortOrder)) {
      throw validation(locale === 'zh' ? '排序值不合法' : 'Invalid sortOrder', ['sortOrder'])
    }
    updates.push('sort_order = ?')
    params.push(input.sortOrder)
  }
  if (input.status !== undefined) {
    updates.push('status = ?')
    params.push(parseStatus(input.status, locale))
  }
  if (updates.length > 0) {
    updates.push('updated_at = ?')
    params.push(new Date().toISOString(), id)
    await db.run({ text: `UPDATE subcategories SET ${updates.join(', ')} WHERE id = ?`, params })
    await audit(db, {
      type: 'subcategory.update',
      actorId: actor.id,
      summaryZh: `更新二级分类 ${existing.code}`,
      summaryEn: `Subcategory updated: ${existing.code}`,
    })
  }
}

// --- Assignment rules ---

export interface AssignmentRuleItem {
  id: number
  category: Ref
  department: Ref | null
  teams: Ref[]
}

async function ruleItems(db: DbClient, locale: Locale): Promise<AssignmentRuleItem[]> {
  const rules = await db.queryAll<{ id: number; category_id: number }>({
    text: 'SELECT id, category_id FROM assignment_rules ORDER BY id',
  })
  const items: AssignmentRuleItem[] = []
  for (const rule of rules) {
    const category = await db.queryOne<CategoryJoined>({
      text: `${CATEGORY_SELECT} WHERE c.id = ?`,
      params: [rule.category_id],
    })
    if (!category) continue
    const teamRows = await db.queryAll<{ id: number; name_zh: string; name_en: string }>({
      text: `SELECT t.id, t.name_zh, t.name_en FROM assignment_rule_targets art
             JOIN teams t ON t.id = art.team_id WHERE art.rule_id = ? ORDER BY t.id`,
      params: [rule.id],
    })
    const pair = localizedPair('zh', category.name_zh, category.name_en)
    items.push({
      id: rule.id,
      category: { id: category.id, nameZh: pair.nameZh, nameEn: pair.nameEn },
      department: serializeRef(locale, category.department_id, category.department_name_zh, category.department_name_en),
      teams: teamRows.map((team) => {
        const teamPair = localizedPair('zh', team.name_zh, team.name_en)
        return { id: team.id, nameZh: teamPair.nameZh, nameEn: teamPair.nameEn }
      }),
    })
  }
  return items
}

export async function listAssignmentRules(db: DbClient, q: string | undefined, locale: Locale) {
  const items = await ruleItems(db, locale)
  const unconfiguredRows = await db.queryAll<CategoryJoined>({
    text: `${CATEGORY_SELECT} WHERE c.is_skeleton = 0 AND NOT EXISTS (
             SELECT 1 FROM assignment_rules ar WHERE ar.category_id = c.id)
           ORDER BY c.sort_order, c.id`,
  })
  const unconfiguredCategories = unconfiguredRows.map((row) => {
    const pair = localizedPair('zh', row.name_zh, row.name_en)
    return { id: row.id, nameZh: pair.nameZh, nameEn: pair.nameEn }
  })
  if (!q?.trim()) return { items, unconfiguredCategories }
  const needle = q.trim().toLowerCase()
  const matches = (item: { nameZh: string; nameEn: string; code?: string }, extra?: string) =>
    item.nameZh.toLowerCase().includes(needle) ||
    item.nameEn.toLowerCase().includes(needle) ||
    (extra ?? '').toLowerCase().includes(needle)
  const filteredItems = items.filter(
    (item) =>
      matches(item.category) ||
      matches({ nameZh: item.department?.nameZh ?? '', nameEn: item.department?.nameEn ?? '' }),
  )
  const filteredUnconfigured = unconfiguredCategories.filter((category) => matches(category))
  return { items: filteredItems, unconfiguredCategories: filteredUnconfigured }
}

async function assertTeamsMatchCategory(
  db: DbClient,
  categoryId: number,
  teamIds: number[],
  locale: Locale,
): Promise<void> {
  const category = await db.queryOne<CategoryRow>({ text: 'SELECT * FROM categories WHERE id = ?', params: [categoryId] })
  if (!category || category.is_skeleton === 1) {
    throw validation(locale === 'zh' ? '分类不存在或不可用' : 'Category does not exist or is not usable', ['categoryId'])
  }
  if (teamIds.length === 0) {
    throw validation(locale === 'zh' ? '目标 Team 不能为空' : 'teamIds cannot be empty', ['teamIds'])
  }
  for (const teamId of teamIds) {
    const team = await db.queryOne<{ id: number; department_id: number }>({
      text: 'SELECT id, department_id FROM teams WHERE id = ?',
      params: [teamId],
    })
    if (!team || category.department_id === null || team.department_id !== category.department_id) {
      throw ruleTeamDepartmentMismatch(
        locale === 'zh' ? '分配规则的目标 Team 不属于分类所属部门' : 'The rule target team does not belong to the category department',
      )
    }
  }
}

export async function createAssignmentRule(
  db: DbClient,
  actor: SessionUser,
  input: { categoryId: number; teamIds: number[] },
  locale: Locale,
): Promise<void> {
  await assertTeamsMatchCategory(db, input.categoryId, input.teamIds, locale)
  const existing = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM assignment_rules WHERE category_id = ?',
    params: [input.categoryId],
  })
  if (existing) {
    throw validation(locale === 'zh' ? '该分类已配置分配规则' : 'A rule already exists for the category', ['categoryId'])
  }
  const now = new Date().toISOString()
  await db.transaction(async (tx) => {
    await tx.run({
      text: 'INSERT INTO assignment_rules (category_id, created_at, updated_at) VALUES (?, ?, ?)',
      params: [input.categoryId, now, now],
    })
    const row = await tx.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
    const ruleId = Number(row?.id ?? 0)
    for (const teamId of new Set(input.teamIds)) {
      await tx.run({
        text: 'INSERT INTO assignment_rule_targets (rule_id, team_id) VALUES (?, ?)',
        params: [ruleId, teamId],
      })
    }
  })
  await audit(db, {
    type: 'assignment_rule.create',
    actorId: actor.id,
    summaryZh: `新增分配规则（分类 #${input.categoryId}）`,
    summaryEn: `Assignment rule created (category #${input.categoryId})`,
  })
}

export async function updateAssignmentRule(
  db: DbClient,
  actor: SessionUser,
  id: number,
  input: { teamIds: number[] },
  locale: Locale,
): Promise<void> {
  const rule = await db.queryOne<{ id: number; category_id: number }>({
    text: 'SELECT id, category_id FROM assignment_rules WHERE id = ?',
    params: [id],
  })
  if (!rule) throw notFound(locale === 'zh' ? '分配规则不存在' : 'Assignment rule not found')
  await assertTeamsMatchCategory(db, rule.category_id, input.teamIds, locale)
  await db.transaction(async (tx) => {
    await tx.run({ text: 'DELETE FROM assignment_rule_targets WHERE rule_id = ?', params: [id] })
    for (const teamId of new Set(input.teamIds)) {
      await tx.run({
        text: 'INSERT INTO assignment_rule_targets (rule_id, team_id) VALUES (?, ?)',
        params: [id, teamId],
      })
    }
    await tx.run({ text: 'UPDATE assignment_rules SET updated_at = ? WHERE id = ?', params: [new Date().toISOString(), id] })
  })
  await audit(db, {
    type: 'assignment_rule.update',
    actorId: actor.id,
    summaryZh: `更新分配规则 #${id}`,
    summaryEn: `Assignment rule updated #${id}`,
  })
}

export async function deleteAssignmentRule(db: DbClient, actor: SessionUser, id: number, locale: Locale): Promise<void> {
  const rule = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM assignment_rules WHERE id = ?', params: [id] })
  if (!rule) throw notFound(locale === 'zh' ? '分配规则不存在' : 'Assignment rule not found')
  await db.run({ text: 'DELETE FROM assignment_rules WHERE id = ?', params: [id] })
  await audit(db, {
    type: 'assignment_rule.delete',
    actorId: actor.id,
    summaryZh: `删除分配规则 #${id}`,
    summaryEn: `Assignment rule deleted #${id}`,
  })
}

export async function exportAssignmentRulesCsv(db: DbClient): Promise<string> {
  // Always the full set; the export ignores the current search filter (§5).
  const rows = await db.queryAll<{ category_code: string; team_code: string }>({
    text: `SELECT c.code AS category_code, t.code AS team_code
           FROM assignment_rules ar
           JOIN categories c ON c.id = ar.category_id
           JOIN assignment_rule_targets art ON art.rule_id = ar.id
           JOIN teams t ON t.id = art.team_id
           ORDER BY ar.id, t.id`,
  })
  const grouped = new Map<string, string[]>()
  for (const row of rows) {
    const list = grouped.get(row.category_code) ?? []
    list.push(row.team_code)
    grouped.set(row.category_code, list)
  }
  return csvDocument(
    ['categoryCode', 'teamCodes'],
    [...grouped.entries()].map(([categoryCode, teamCodes]) => [categoryCode, teamCodes.join(';')]),
  )
}

export interface RuleImportRow {
  categoryCode: string
  teamCodes: string[]
}

export async function importAssignmentRules(
  db: DbClient,
  actor: SessionUser,
  rows: RuleImportRow[],
  locale: Locale,
): Promise<number> {
  let applied = 0
  for (const row of rows) {
    // Per-row validation; a failed row returns CSV_ROW_INVALID and does not
    // affect rows applied before it (contract §5).
    const category = await db.queryOne<CategoryRow>({
      text: 'SELECT * FROM categories WHERE code = ?',
      params: [row.categoryCode?.trim() ?? ''],
    })
    if (!category || category.is_skeleton === 1) {
      throw csvRowInvalid(locale === 'zh' ? '导入行无法按编码匹配' : 'Import row cannot be matched by code', row)
    }
    if (!row.teamCodes || row.teamCodes.length === 0) {
      throw csvRowInvalid(locale === 'zh' ? '导入行无法按编码匹配' : 'Import row cannot be matched by code', row)
    }
    const teamIds: number[] = []
    for (const teamCode of row.teamCodes) {
      const team = await db.queryOne<{ id: number; department_id: number }>({
        text: 'SELECT id, department_id FROM teams WHERE code = ? AND department_id = ?',
        params: [teamCode.trim(), category.department_id ?? -1],
      })
      if (!team) {
        throw csvRowInvalid(locale === 'zh' ? '导入行无法按编码匹配' : 'Import row cannot be matched by code', row)
      }
      teamIds.push(team.id)
    }
    const now = new Date().toISOString()
    const existing = await db.queryOne<{ id: number }>({
      text: 'SELECT id FROM assignment_rules WHERE category_id = ?',
      params: [category.id],
    })
    await db.transaction(async (tx) => {
      let ruleId = existing?.id ?? 0
      if (existing) {
        await tx.run({ text: 'DELETE FROM assignment_rule_targets WHERE rule_id = ?', params: [ruleId] })
        await tx.run({ text: 'UPDATE assignment_rules SET updated_at = ? WHERE id = ?', params: [now, ruleId] })
      } else {
        await tx.run({
          text: 'INSERT INTO assignment_rules (category_id, created_at, updated_at) VALUES (?, ?, ?)',
          params: [category.id, now, now],
        })
        const inserted = await tx.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
        ruleId = Number(inserted?.id ?? 0)
      }
      for (const teamId of new Set(teamIds)) {
        await tx.run({
          text: 'INSERT INTO assignment_rule_targets (rule_id, team_id) VALUES (?, ?)',
          params: [ruleId, teamId],
        })
      }
    })
    applied += 1
  }
  await audit(db, {
    type: 'assignment_rule.import',
    actorId: actor.id,
    summaryZh: `导入分配规则 ${applied} 行`,
    summaryEn: `Assignment rules imported: ${applied} rows`,
  })
  return applied
}
