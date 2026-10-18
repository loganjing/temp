// Organization & user management service: companies (tree + CSV), departments,
// teams, members, candidate pools, vacations, admin user CRUD (contract §4).
// Credential storage goes through userkit (platform users table); business
// attributes live in biz_users and are joined by credential_user_id.
import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import { createUserStore } from '@commonapp/userkit'
import { hashPassword } from '@commonapp/authkit'
import type { Locale, Ref, TeamMemberCard, UserRef } from '../../shared/domain'
import { ApiError, notFound, validation } from '../core/errors'
import { localizedPair, serializeUserRef } from '../core/serialize'
import { activeVacationOf } from '../core/assignment'
import { todayKey } from '../core/sla'
import type { BizUserRow, CompanyRow } from '../core/rows'
import type { SessionUser } from '../core/session'
import { csvDocument } from '../core/csv'
import { createConfigAudit, type ConfigAuditInput } from './audit'

const ADMIN_PAGE_SIZE = 20

function audit(db: DbClient, input: ConfigAuditInput): Promise<void> {
  return createConfigAudit(db).record(input)
}

function requireAdminFields(locale: Locale, messageZh: string, messageEn: string, fields: string[]): never {
  throw validation(locale === 'zh' ? messageZh : messageEn, fields)
}

function parseStatus(value: unknown, locale: Locale): number {
  if (value === 1 || value === 0) return value
  if (value === '1' || value === '0') return Number(value)
  throw validation(locale === 'zh' ? '状态不合法' : 'Invalid status', ['status'])
}

async function userRef(db: DbClient, id: number, locale: Locale): Promise<UserRef | null> {
  const row = await db.queryOne<BizUserRow>({ text: 'SELECT * FROM biz_users WHERE id = ?', params: [id] })
  return serializeUserRef(locale, row)
}

async function activeUsers(db: DbClient): Promise<BizUserRow[]> {
  return db.queryAll<BizUserRow>({ text: 'SELECT * FROM biz_users WHERE status = 1 ORDER BY id' })
}

// --- Companies ---

export interface CompanyNode {
  id: number
  code: string
  nameZh: string
  nameEn: string
  status: number
  children: CompanyNode[]
}

export async function listCompanies(db: DbClient, q: string | undefined): Promise<CompanyNode[]> {
  const rows = await db.queryAll<CompanyRow>({
    text: 'SELECT id, code, name_zh, name_en, parent_id, status FROM companies ORDER BY id',
  })
  const matched = q
    ? rows.filter((r) => r.code.includes(q) || r.name_zh.includes(q) || r.name_en.includes(q))
    : rows
  const byId = new Map(rows.map((r) => [r.id, r]))
  const keep = new Set<number>()
  for (const row of matched) {
    let cursor: CompanyRow | undefined = row
    while (cursor) {
      keep.add(cursor.id)
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined
    }
  }
  const nodes = new Map<number, CompanyNode>()
  for (const row of rows) {
    if (!keep.has(row.id)) continue
    const pair = localizedPair('zh', row.name_zh, row.name_en)
    nodes.set(row.id, { id: row.id, code: row.code, nameZh: pair.nameZh, nameEn: pair.nameEn, status: row.status, children: [] })
  }
  const roots: CompanyNode[] = []
  for (const node of nodes.values()) {
    const parent = rows.find((r) => r.id === node.id)?.parent_id
    const parentNode = parent ? nodes.get(parent) : undefined
    if (parentNode) parentNode.children.push(node)
    else roots.push(node)
  }
  return roots
}

export interface CompanyInput {
  code: string
  nameZh: string
  nameEn?: string | null
  parentId?: number | null
  status?: number | string
}

export async function createCompany(db: DbClient, actor: SessionUser, input: CompanyInput, locale: Locale): Promise<CompanyNode> {
  if (!input.code?.trim()) requireAdminFields(locale, '编码必填', 'code is required', ['code'])
  if (!input.nameZh?.trim()) requireAdminFields(locale, '中文名必填', 'nameZh is required', ['nameZh'])
  const status = parseStatus(input.status ?? 1, locale)
  const duplicate = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM companies WHERE code = ?',
    params: [input.code.trim()],
  })
  if (duplicate) requireAdminFields(locale, '公司编码已存在', 'Company code already exists', ['code'])
  if (input.parentId != null) {
    const parent = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM companies WHERE id = ?', params: [input.parentId] })
    if (!parent) requireAdminFields(locale, '父公司不存在', 'Parent company does not exist', ['parentId'])
  }
  const now = new Date().toISOString()
  const id = await db.transaction(async (tx) => {
    await tx.run({
      text: `INSERT INTO companies (code, name_zh, name_en, parent_id, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [input.code.trim(), input.nameZh.trim(), input.nameEn?.trim() ?? '', input.parentId ?? null, status, now, now],
    })
    const row = await tx.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
    return Number(row?.id ?? 0)
  })
  await audit(db, {
    type: 'company.create',
    actorId: actor.id,
    summaryZh: `新增公司 ${input.code.trim()}`,
    summaryEn: `Company created: ${input.code.trim()}`,
  })
  const pair = localizedPair('zh', input.nameZh, input.nameEn)
  return { id, code: input.code.trim(), nameZh: pair.nameZh, nameEn: pair.nameEn, status, children: [] }
}

export async function updateCompany(
  db: DbClient,
  actor: SessionUser,
  id: number,
  input: { nameZh?: string; nameEn?: string | null; status?: number | string },
  locale: Locale,
): Promise<void> {
  const existing = await db.queryOne<CompanyRow>({ text: 'SELECT * FROM companies WHERE id = ?', params: [id] })
  if (!existing) throw notFound(locale === 'zh' ? '公司不存在' : 'Company not found')
  const updates: string[] = []
  const params: unknown[] = []
  if (input.nameZh !== undefined) {
    if (!input.nameZh.trim()) requireAdminFields(locale, '中文名必填', 'nameZh is required', ['nameZh'])
    updates.push('name_zh = ?')
    params.push(input.nameZh.trim())
  }
  if (input.nameEn !== undefined) {
    updates.push('name_en = ?')
    params.push(input.nameEn?.trim() ?? '')
  }
  if (input.status !== undefined) {
    updates.push('status = ?')
    params.push(parseStatus(input.status, locale))
  }
  if (updates.length > 0) {
    updates.push('updated_at = ?')
    params.push(new Date().toISOString(), id)
    await db.run({ text: `UPDATE companies SET ${updates.join(', ')} WHERE id = ?`, params })
    await audit(db, {
      type: 'company.update',
      actorId: actor.id,
      summaryZh: `更新公司 ${existing.code}`,
      summaryEn: `Company updated: ${existing.code}`,
    })
  }
}

export function exportCompaniesCsv(db: DbClient): Promise<string> {
  return db
    .queryAll<CompanyRow>({ text: 'SELECT id, code, name_zh, name_en, parent_id, status FROM companies ORDER BY id' })
    .then(async (rows) => {
      const byId = new Map(rows.map((r) => [r.id, r]))
      const lines = rows.map((row) => [
        row.code,
        row.parent_id ? byId.get(row.parent_id)?.code ?? '' : '',
        row.name_zh,
        row.name_en,
        row.status,
      ])
      return csvDocument(['code', 'parentCode', 'nameZh', 'nameEn', 'status'], lines)
    })
}

export interface CompanyImportRow {
  code: string
  parentCode?: string
  nameZh: string
  nameEn?: string
  status?: number | string
}

export async function importCompanies(db: DbClient, actor: SessionUser, rows: CompanyImportRow[], locale: Locale): Promise<number> {
  const failures: Array<{ row: number; reason: string }> = []
  let applied = 0
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    try {
      if (!row.code?.trim()) throw new Error('code is required')
      if (!row.nameZh?.trim()) throw new Error('nameZh is required')
      const status = parseStatus(row.status ?? 1, locale)
      let parentId: number | null = null
      if (row.parentCode?.trim()) {
        const parent = await db.queryOne<{ id: number }>({
          text: 'SELECT id FROM companies WHERE code = ?',
          params: [row.parentCode.trim()],
        })
        if (!parent) throw new Error(`parentCode not found: ${row.parentCode.trim()}`)
        if (parent.id === undefined) throw new Error('parentCode not found')
        parentId = parent.id
      }
      const existing = await db.queryOne<{ id: number }>({
        text: 'SELECT id FROM companies WHERE code = ?',
        params: [row.code.trim()],
      })
      const now = new Date().toISOString()
      if (existing) {
        await db.run({
          text: 'UPDATE companies SET name_zh = ?, name_en = ?, parent_id = ?, status = ?, updated_at = ? WHERE id = ?',
          params: [row.nameZh.trim(), row.nameEn?.trim() ?? '', parentId, status, now, existing.id],
        })
      } else {
        await db.run({
          text: `INSERT INTO companies (code, name_zh, name_en, parent_id, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [row.code.trim(), row.nameZh.trim(), row.nameEn?.trim() ?? '', parentId, status, now, now],
        })
      }
      applied += 1
    } catch (error) {
      failures.push({ row: index, reason: error instanceof Error ? error.message : 'invalid row' })
    }
  }
  if (failures.length > 0) {
    throw new ApiError(422, 'VALIDATION', locale === 'zh' ? '导入行校验失败' : 'Import rows failed validation', {
      rows: failures,
    })
  }
  await audit(db, {
    type: 'company.import',
    actorId: actor.id,
    summaryZh: `导入公司 ${applied} 行`,
    summaryEn: `Companies imported: ${applied} rows`,
  })
  return applied
}

// --- Departments ---

export interface DepartmentListItem {
  id: number
  code: string
  nameZh: string
  nameEn: string
  assignMode: 'auto' | 'manual'
  status: number
  managers: UserRef[]
  teamCount: number
}

export async function listDepartments(db: DbClient, page: number, locale: Locale) {
  const totalRow = await db.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM departments' })
  const rows = await db.queryAll<{ id: number; code: string; name_zh: string; name_en: string; assign_mode: string; status: number }>({
    text: 'SELECT id, code, name_zh, name_en, assign_mode, status FROM departments ORDER BY id LIMIT ? OFFSET ?',
    params: [ADMIN_PAGE_SIZE, (page - 1) * ADMIN_PAGE_SIZE],
  })
  const items: DepartmentListItem[] = []
  for (const row of rows) {
    const managerRows = await db.queryAll<BizUserRow>({
      text: `SELECT u.* FROM department_managers dm JOIN biz_users u ON u.id = dm.user_id
             WHERE dm.department_id = ? ORDER BY u.id`,
      params: [row.id],
    })
    const teamCount = await db.queryOne<{ total: number }>({
      text: 'SELECT COUNT(*) AS total FROM teams WHERE department_id = ?',
      params: [row.id],
    })
    const pair = localizedPair('zh', row.name_zh, row.name_en)
    items.push({
      id: row.id,
      code: row.code,
      nameZh: pair.nameZh,
      nameEn: pair.nameEn,
      assignMode: row.assign_mode as 'auto' | 'manual',
      status: row.status,
      managers: managerRows.flatMap((m) => {
        const ref = serializeUserRef(locale, m)
        return ref ? [ref] : []
      }),
      teamCount: Number(teamCount?.total ?? 0),
    })
  }
  return { items, page, pageSize: ADMIN_PAGE_SIZE, total: Number(totalRow?.total ?? 0) }
}

export interface DepartmentInput {
  code: string
  nameZh: string
  nameEn?: string | null
  managerIds?: number[]
  assignMode?: 'auto' | 'manual'
  status?: number | string
}

async function validateManagerIds(db: DbClient, managerIds: number[], locale: Locale): Promise<void> {
  for (const managerId of managerIds) {
    const user = await db.queryOne<{ id: number; status: number }>({
      text: 'SELECT id, status FROM biz_users WHERE id = ?',
      params: [managerId],
    })
    if (!user || user.status !== 1) {
      requireAdminFields(locale, '经理不存在或不可用', 'Manager does not exist or is disabled', ['managerIds'])
    }
  }
}

export async function createDepartment(db: DbClient, actor: SessionUser, input: DepartmentInput, locale: Locale): Promise<void> {
  if (!input.code?.trim()) requireAdminFields(locale, '编码必填', 'code is required', ['code'])
  if (!input.nameZh?.trim()) requireAdminFields(locale, '中文名必填', 'nameZh is required', ['nameZh'])
  const status = parseStatus(input.status ?? 1, locale)
  const assignMode = input.assignMode ?? 'auto'
  if (assignMode !== 'auto' && assignMode !== 'manual') {
    requireAdminFields(locale, '分配模式不合法', 'Invalid assignMode', ['assignMode'])
  }
  const duplicate = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM departments WHERE code = ?',
    params: [input.code.trim()],
  })
  if (duplicate) requireAdminFields(locale, '部门编码已存在', 'Department code already exists', ['code'])
  const managerIds = input.managerIds ?? []
  await validateManagerIds(db, managerIds, locale)
  const now = new Date().toISOString()
  await db.transaction(async (tx) => {
    await tx.run({
      text: `INSERT INTO departments (code, name_zh, name_en, assign_mode, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [input.code.trim(), input.nameZh.trim(), input.nameEn?.trim() ?? '', assignMode, status, now, now],
    })
    const row = await tx.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
    const departmentId = Number(row?.id ?? 0)
    for (const managerId of managerIds) {
      await tx.run({
        text: 'INSERT INTO department_managers (department_id, user_id) VALUES (?, ?)',
        params: [departmentId, managerId],
      })
    }
  })
  await audit(db, {
    type: 'department.create',
    actorId: actor.id,
    summaryZh: `新增部门 ${input.code.trim()}`,
    summaryEn: `Department created: ${input.code.trim()}`,
  })
}

export async function updateDepartment(
  db: DbClient,
  actor: SessionUser,
  id: number,
  input: { nameZh?: string; nameEn?: string | null; managerIds?: number[]; assignMode?: 'auto' | 'manual'; status?: number | string },
  locale: Locale,
): Promise<void> {
  const existing = await db.queryOne<{ id: number; code: string }>({
    text: 'SELECT id, code FROM departments WHERE id = ?',
    params: [id],
  })
  if (!existing) throw notFound(locale === 'zh' ? '部门不存在' : 'Department not found')
  if (input.assignMode && input.assignMode !== 'auto' && input.assignMode !== 'manual') {
    requireAdminFields(locale, '分配模式不合法', 'Invalid assignMode', ['assignMode'])
  }
  if (input.managerIds) await validateManagerIds(db, input.managerIds, locale)
  const now = new Date().toISOString()
  await db.transaction(async (tx) => {
    const updates: string[] = []
    const params: unknown[] = []
    if (input.nameZh !== undefined) {
      if (!input.nameZh.trim()) requireAdminFields(locale, '中文名必填', 'nameZh is required', ['nameZh'])
      updates.push('name_zh = ?')
      params.push(input.nameZh.trim())
    }
    if (input.nameEn !== undefined) {
      updates.push('name_en = ?')
      params.push(input.nameEn?.trim() ?? '')
    }
    if (input.assignMode !== undefined) {
      updates.push('assign_mode = ?')
      params.push(input.assignMode)
    }
    if (input.status !== undefined) {
      updates.push('status = ?')
      params.push(parseStatus(input.status, locale))
    }
    if (updates.length > 0) {
      updates.push('updated_at = ?')
      params.push(now, id)
      await tx.run({ text: `UPDATE departments SET ${updates.join(', ')} WHERE id = ?`, params })
    }
    if (input.managerIds) {
      await tx.run({ text: 'DELETE FROM department_managers WHERE department_id = ?', params: [id] })
      for (const managerId of input.managerIds) {
        await tx.run({
          text: 'INSERT INTO department_managers (department_id, user_id) VALUES (?, ?)',
          params: [id, managerId],
        })
      }
    }
  })
  await audit(db, {
    type: 'department.update',
    actorId: actor.id,
    summaryZh: `更新部门 ${existing.code}`,
    summaryEn: `Department updated: ${existing.code}`,
  })
}

// --- Teams ---

async function serializeTeamRef(db: DbClient, teamId: number, locale: Locale): Promise<Ref | null> {
  const row = await db.queryOne<{ id: number; name_zh: string; name_en: string }>({
    text: 'SELECT id, name_zh, name_en FROM teams WHERE id = ?',
    params: [teamId],
  })
  if (!row) return null
  const pair = localizedPair('zh', row.name_zh, row.name_en)
  return { id: row.id, nameZh: pair.nameZh, nameEn: pair.nameEn }
}

export async function departmentTeams(db: DbClient, departmentId: number, locale: Locale) {
  const department = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM departments WHERE id = ?',
    params: [departmentId],
  })
  if (!department) throw notFound(locale === 'zh' ? '部门不存在' : 'Department not found')
  const rows = await db.queryAll<{ id: number; code: string; name_zh: string; name_en: string; status: number }>({
    text: 'SELECT id, code, name_zh, name_en, status FROM teams WHERE department_id = ? ORDER BY id',
    params: [departmentId],
  })
  const items = rows.map((row) => {
    const pair = localizedPair('zh', row.name_zh, row.name_en)
    return { id: row.id, code: row.code, nameZh: pair.nameZh, nameEn: pair.nameEn, status: row.status }
  })
  return { items }
}

export interface TeamInput {
  departmentId: number
  code: string
  nameZh: string
  nameEn?: string | null
  status?: number | string
}

export async function createTeam(db: DbClient, actor: SessionUser, input: TeamInput, locale: Locale): Promise<void> {
  if (!input.code?.trim()) requireAdminFields(locale, '编码必填', 'code is required', ['code'])
  if (!input.nameZh?.trim()) requireAdminFields(locale, '中文名必填', 'nameZh is required', ['nameZh'])
  const department = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM departments WHERE id = ?',
    params: [input.departmentId],
  })
  if (!department) requireAdminFields(locale, '部门不存在', 'Department does not exist', ['departmentId'])
  const duplicate = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM teams WHERE department_id = ? AND code = ?',
    params: [input.departmentId, input.code.trim()],
  })
  if (duplicate) requireAdminFields(locale, '同部门下 Team 编码已存在', 'Team code already exists in the department', ['code'])
  const status = parseStatus(input.status ?? 1, locale)
  const now = new Date().toISOString()
  await db.run({
    text: `INSERT INTO teams (department_id, code, name_zh, name_en, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [input.departmentId, input.code.trim(), input.nameZh.trim(), input.nameEn?.trim() ?? '', status, now, now],
  })
  await audit(db, {
    type: 'team.create',
    actorId: actor.id,
    summaryZh: `新增 Team ${input.code.trim()}`,
    summaryEn: `Team created: ${input.code.trim()}`,
  })
}

async function loadTeam(db: DbClient, teamId: number, locale: Locale): Promise<{ id: number; department_id: number; code: string }> {
  const team = await db.queryOne<{ id: number; department_id: number; code: string }>({
    text: 'SELECT id, department_id, code FROM teams WHERE id = ?',
    params: [teamId],
  })
  if (!team) throw notFound(locale === 'zh' ? 'Team 不存在' : 'Team not found')
  return team
}

export async function updateTeam(
  db: DbClient,
  actor: SessionUser,
  teamId: number,
  input: { nameZh?: string; nameEn?: string | null },
  locale: Locale,
): Promise<void> {
  const team = await loadTeam(db, teamId, locale)
  const updates: string[] = []
  const params: unknown[] = []
  if (input.nameZh !== undefined) {
    if (!input.nameZh.trim()) requireAdminFields(locale, '中文名必填', 'nameZh is required', ['nameZh'])
    updates.push('name_zh = ?')
    params.push(input.nameZh.trim())
  }
  if (input.nameEn !== undefined) {
    updates.push('name_en = ?')
    params.push(input.nameEn?.trim() ?? '')
  }
  if (updates.length > 0) {
    updates.push('updated_at = ?')
    params.push(new Date().toISOString(), teamId)
    await db.run({ text: `UPDATE teams SET ${updates.join(', ')} WHERE id = ?`, params })
    await audit(db, {
      type: 'team.update',
      actorId: actor.id,
      summaryZh: `更新 Team ${team.code}`,
      summaryEn: `Team updated: ${team.code}`,
    })
  }
}

export async function setTeamStatus(db: DbClient, actor: SessionUser, teamId: number, status: number | string, locale: Locale): Promise<void> {
  const team = await loadTeam(db, teamId, locale)
  const parsed = parseStatus(status, locale)
  await db.run({
    text: 'UPDATE teams SET status = ?, updated_at = ? WHERE id = ?',
    params: [parsed, new Date().toISOString(), teamId],
  })
  await audit(db, {
    type: 'team.status',
    actorId: actor.id,
    summaryZh: `Team ${team.code} ${parsed === 1 ? '启用' : '停用'}`,
    summaryEn: `Team ${team.code} ${parsed === 1 ? 'enabled' : 'disabled'}`,
  })
}

// --- Members & candidate pools ---

export async function teamMembers(db: DbClient, teamId: number, locale: Locale): Promise<{ items: TeamMemberCard[] }> {
  await loadTeam(db, teamId, locale)
  const rows = await db.queryAll<BizUserRow>({
    text: `SELECT u.* FROM team_members tm JOIN biz_users u ON u.id = tm.user_id
           WHERE tm.team_id = ? ORDER BY u.id`,
    params: [teamId],
  })
  const items: TeamMemberCard[] = []
  for (const row of rows) {
    const user = serializeUserRef(locale, row)
    if (!user) continue
    const vacation = await activeVacationOf(db, row.id)
    items.push({ user, vacation })
  }
  return { items }
}

async function departmentPeople(db: DbClient, departmentId: number): Promise<number[]> {
  const teamRows = await db.queryAll<{ user_id: number }>({
    text: `SELECT DISTINCT tm.user_id AS user_id FROM team_members tm
           JOIN teams t ON t.id = tm.team_id WHERE t.department_id = ?`,
    params: [departmentId],
  })
  const directRows = await db.queryAll<{ user_id: number }>({
    text: 'SELECT user_id FROM department_users WHERE department_id = ?',
    params: [departmentId],
  })
  return [...new Set([...teamRows, ...directRows].map((r) => r.user_id))]
}

export async function teamMemberCandidates(db: DbClient, teamId: number, locale: Locale): Promise<{ items: UserRef[] }> {
  const team = await loadTeam(db, teamId, locale)
  const current = new Set(
    (await db.queryAll<{ user_id: number }>({ text: 'SELECT user_id FROM team_members WHERE team_id = ?', params: [teamId] })).map(
      (r) => r.user_id,
    ),
  )
  const people = await departmentPeople(db, team.department_id)
  let pool: number[]
  if (people.length === 0) {
    pool = (await activeUsers(db)).map((u) => u.id)
  } else {
    pool = people
  }
  const items: UserRef[] = []
  for (const userId of pool) {
    if (current.has(userId)) continue
    const ref = await userRef(db, userId, locale)
    if (ref) items.push(ref)
  }
  return { items }
}

export async function addTeamMember(db: DbClient, teamId: number, userId: number, locale: Locale): Promise<void> {
  const team = await loadTeam(db, teamId, locale)
  const user = await db.queryOne<{ id: number; status: number }>({
    text: 'SELECT id, status FROM biz_users WHERE id = ?',
    params: [userId],
  })
  if (!user || user.status !== 1) {
    requireAdminFields(locale, '用户不存在或不可用', 'User does not exist or is disabled', ['userId'])
  }
  const candidates = await teamMemberCandidates(db, teamId, locale)
  if (!candidates.items.some((candidate) => candidate.id === userId)) {
    requireAdminFields(locale, '用户不在候选池内', 'User is not in the candidate pool', ['userId'])
  }
  await db.run({
    text: 'INSERT INTO team_members (team_id, user_id) VALUES (?, ?)',
    params: [team.id, userId],
  })
}

export async function removeTeamMember(db: DbClient, teamId: number, userId: number, locale: Locale): Promise<void> {
  await loadTeam(db, teamId, locale)
  await db.run({ text: 'DELETE FROM team_members WHERE team_id = ? AND user_id = ?', params: [teamId, userId] })
}

export async function departmentMemberCandidates(db: DbClient, departmentId: number, locale: Locale): Promise<{ items: UserRef[] }> {
  const department = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM departments WHERE id = ?',
    params: [departmentId],
  })
  if (!department) throw notFound(locale === 'zh' ? '部门不存在' : 'Department not found')
  const rows = await activeUsers(db)
  return { items: rows.flatMap((row) => {
    const ref = serializeUserRef(locale, row)
    return ref ? [ref] : []
  }) }
}

export async function addDepartmentMember(db: DbClient, departmentId: number, userId: number, locale: Locale): Promise<void> {
  const department = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM departments WHERE id = ?',
    params: [departmentId],
  })
  if (!department) throw notFound(locale === 'zh' ? '部门不存在' : 'Department not found')
  const user = await db.queryOne<{ id: number; status: number }>({
    text: 'SELECT id, status FROM biz_users WHERE id = ?',
    params: [userId],
  })
  if (!user || user.status !== 1) {
    requireAdminFields(locale, '用户不存在或不可用', 'User does not exist or is disabled', ['userId'])
  }
  await db.run({
    text: 'INSERT INTO department_users (department_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
    params: [departmentId, userId],
  })
}

// --- Vacations ---

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export async function setVacation(
  db: DbClient,
  teamId: number,
  userId: number,
  input: { startDate: string; endDate: string; autoReplyText?: string },
  locale: Locale,
): Promise<void> {
  await loadTeam(db, teamId, locale)
  const member = await db.queryOne<{ user_id: number }>({
    text: 'SELECT user_id FROM team_members WHERE team_id = ? AND user_id = ?',
    params: [teamId, userId],
  })
  if (!member) throw notFound(locale === 'zh' ? '成员不存在' : 'Team member not found')
  if (!DATE_PATTERN.test(input.startDate ?? '') || !DATE_PATTERN.test(input.endDate ?? '')) {
    requireAdminFields(locale, '日期格式不合法', 'Invalid date format', ['startDate', 'endDate'])
  }
  // Start/end auto-sorted (contract §4.2).
  const startDate = input.startDate <= input.endDate ? input.startDate : input.endDate
  const endDate = input.startDate <= input.endDate ? input.endDate : input.startDate
  const today = await todayKey(db)
  // Single active-or-future record per user: posting replaces the existing one.
  await db.transaction(async (tx) => {
    await tx.run({ text: 'DELETE FROM vacations WHERE user_id = ? AND end_date >= ?', params: [userId, today] })
    await tx.run({
      text: 'INSERT INTO vacations (user_id, start_date, end_date, auto_reply_text, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [userId, startDate, endDate, input.autoReplyText?.trim() || null, new Date().toISOString()],
    })
  })
}

export async function deleteVacation(db: DbClient, teamId: number, userId: number, locale: Locale): Promise<void> {
  await loadTeam(db, teamId, locale)
  const member = await db.queryOne<{ user_id: number }>({
    text: 'SELECT user_id FROM team_members WHERE team_id = ? AND user_id = ?',
    params: [teamId, userId],
  })
  if (!member) throw notFound(locale === 'zh' ? '成员不存在' : 'Team member not found')
  const today = await todayKey(db)
  await db.run({ text: 'DELETE FROM vacations WHERE user_id = ? AND end_date >= ?', params: [userId, today] })
}

// --- Admin users ---

export interface UserListItem {
  id: number
  nameZh: string
  nameEn: string
  email: string
  phone: string | null
  role: string
  companyId: number | null
  companyNameZh: string | null
  companyNameEn: string | null
  status: number
}

export async function listUsers(db: DbClient, page: number, q: string | undefined, locale: Locale) {
  const filter = q ? 'WHERE u.email LIKE ? OR u.name_zh LIKE ? OR u.name_en LIKE ?' : ''
  const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : []
  const totalRow = await db.queryOne<{ total: number }>({
    text: `SELECT COUNT(*) AS total FROM biz_users u ${filter}`,
    params,
  })
  const rows = await db.queryAll<
    BizUserRow & { company_name_zh: string | null; company_name_en: string | null }
  >({
    text: `SELECT u.*, c.name_zh AS company_name_zh, c.name_en AS company_name_en
           FROM biz_users u LEFT JOIN companies c ON c.id = u.company_id
           ${filter} ORDER BY u.id LIMIT ? OFFSET ?`,
    params: [...params, ADMIN_PAGE_SIZE, (page - 1) * ADMIN_PAGE_SIZE],
  })
  const items: UserListItem[] = rows.map((row) => {
    const pair = localizedPair('zh', row.name_zh, row.name_en)
    const company = row.company_name_zh || row.company_name_en
      ? localizedPair('zh', row.company_name_zh, row.company_name_en)
      : null
    return {
      id: row.id,
      nameZh: pair.nameZh,
      nameEn: pair.nameEn,
      email: row.email,
      phone: row.phone,
      role: row.role,
      companyId: row.company_id,
      companyNameZh: company?.nameZh ?? null,
      companyNameEn: company?.nameEn ?? null,
      status: row.status,
    }
  })
  return { items, page, pageSize: ADMIN_PAGE_SIZE, total: Number(totalRow?.total ?? 0) }
}

export interface UserInput {
  email: string
  nameZh: string
  nameEn?: string | null
  phone?: string | null
  role: string
  companyId?: number | null
  status?: number | string
  password?: string
}

function validateUserInput(input: UserInput, locale: Locale, requirePassword: boolean): number {
  if (!input.email?.trim() || !/^[^\s@]+@[^\s@]+$/.test(input.email.trim())) {
    requireAdminFields(locale, '邮箱不合法', 'Invalid email', ['email'])
  }
  if (!input.nameZh?.trim()) requireAdminFields(locale, '中文名必填', 'nameZh is required', ['nameZh'])
  if (!['requester', 'agent', 'manager', 'admin'].includes(input.role ?? '')) {
    requireAdminFields(locale, '角色不合法', 'Invalid role', ['role'])
  }
  if (requirePassword && (!input.password || input.password.length < 8)) {
    requireAdminFields(locale, '密码至少 8 位', 'Password must be at least 8 characters', ['password'])
  }
  return parseStatus(input.status ?? 1, locale)
}

async function assertEmailAvailable(db: DbClient, email: string, exceptBizId?: number, locale: Locale = 'en'): Promise<void> {
  const biz = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM biz_users WHERE lower(email) = lower(?)', params: [email] })
  if (biz && biz.id !== exceptBizId) {
    requireAdminFields(locale, '邮箱已被使用', 'Email is already in use', ['email'])
  }
}

export async function createUser(db: DbClient, actor: SessionUser, input: UserInput, locale: Locale): Promise<UserRef> {
  const status = validateUserInput(input, locale, true)
  await assertEmailAvailable(db, input.email.trim(), undefined, locale)
  const userStore = createUserStore(db)
  const platformUser = await userStore.create(
    {
      name: input.nameZh.trim(),
      email: input.email.trim(),
      phone: input.phone?.trim() || null,
      companyId: null,
      enabled: status === 1,
      passwordChangeRequired: false,
    },
    hashPassword(input.password as string),
  )
  const now = new Date().toISOString()
  const bizId = await db.transaction(async (tx) => {
    await tx.run({
      text: `INSERT INTO biz_users (credential_user_id, name_zh, name_en, email, phone, role, company_id, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        platformUser.id,
        input.nameZh.trim(),
        input.nameEn?.trim() ?? '',
        input.email.trim(),
        input.phone?.trim() || null,
        input.role,
        input.companyId ?? null,
        status,
        now,
        now,
      ],
    })
    const row = await tx.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
    return Number(row?.id ?? 0)
  })
  await audit(db, {
    type: 'user.create',
    actorId: actor.id,
    summaryZh: `新增用户 ${input.email.trim()}`,
    summaryEn: `User created: ${input.email.trim()}`,
  })
  const ref = await userRef(db, bizId, locale)
  if (!ref) throw notFound(locale === 'zh' ? '用户不存在' : 'User not found')
  return ref
}

export async function updateUser(
  db: DbClient,
  actor: SessionUser,
  id: number,
  input: Partial<UserInput>,
  locale: Locale,
): Promise<void> {
  const existing = await db.queryOne<BizUserRow>({ text: 'SELECT * FROM biz_users WHERE id = ?', params: [id] })
  if (!existing) throw notFound(locale === 'zh' ? '用户不存在' : 'User not found')
  const merged: UserInput = {
    email: input.email !== undefined ? input.email : existing.email,
    nameZh: input.nameZh !== undefined ? input.nameZh : existing.name_zh,
    nameEn: input.nameEn !== undefined ? input.nameEn : existing.name_en,
    phone: input.phone !== undefined ? input.phone : existing.phone,
    role: input.role !== undefined ? input.role : existing.role,
    companyId: input.companyId !== undefined ? input.companyId : existing.company_id,
    status: input.status !== undefined ? input.status : existing.status,
    password: input.password,
  }
  const status = validateUserInput(merged, locale, false)
  if (merged.email.trim().toLowerCase() !== existing.email.toLowerCase()) {
    await assertEmailAvailable(db, merged.email.trim(), id, locale)
  }
  const userStore = createUserStore(db)
  await userStore.update(existing.credential_user_id, {
    name: merged.nameZh.trim(),
    email: merged.email.trim(),
    phone: merged.phone?.trim() || null,
  })
  await userStore.setEnabled(existing.credential_user_id, status === 1)
  if (input.password) {
    if (input.password.length < 8) {
      requireAdminFields(locale, '密码至少 8 位', 'Password must be at least 8 characters', ['password'])
    }
    await userStore.updatePassword(existing.credential_user_id, hashPassword(input.password))
  }
  const now = new Date().toISOString()
  await db.run({
    text: `UPDATE biz_users SET name_zh = ?, name_en = ?, email = ?, phone = ?, role = ?, company_id = ?, status = ?, updated_at = ?
           WHERE id = ?`,
    params: [
      merged.nameZh.trim(),
      merged.nameEn?.trim() ?? '',
      merged.email.trim(),
      merged.phone?.trim() || null,
      merged.role,
      merged.companyId ?? null,
      status,
      now,
      id,
    ],
  })
  await audit(db, {
    type: 'user.update',
    actorId: actor.id,
    summaryZh: `更新用户 ${existing.email}`,
    summaryEn: `User updated: ${existing.email}`,
  })
}

export async function exportUsersCsv(db: DbClient): Promise<string> {
  const rows = await db.queryAll<BizUserRow & { company_code: string | null }>({
    text: `SELECT u.*, c.code AS company_code FROM biz_users u LEFT JOIN companies c ON c.id = u.company_id ORDER BY u.id`,
  })
  return csvDocument(
    ['email', 'nameZh', 'nameEn', 'phone', 'role', 'companyCode', 'status'],
    rows.map((row) => [
      row.email,
      row.name_zh,
      row.name_en,
      row.phone ?? '',
      row.role,
      row.company_code ?? '',
      row.status,
    ]),
  )
}

export interface UserImportRow {
  email: string
  nameZh: string
  nameEn?: string
  phone?: string
  role: string
  companyCode?: string
  status?: number | string
}

export async function importUsers(db: DbClient, actor: SessionUser, rows: UserImportRow[], locale: Locale): Promise<number> {
  const failures: Array<{ row: number; reason: string }> = []
  let applied = 0
  const userStore = createUserStore(db)
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    try {
      if (!row.email?.trim() || !/^[^\s@]+@[^\s@]+$/.test(row.email.trim())) throw new Error('invalid email')
      if (!row.nameZh?.trim()) throw new Error('nameZh is required')
      if (!['requester', 'agent', 'manager', 'admin'].includes(row.role ?? '')) throw new Error('invalid role')
      const status = parseStatus(row.status ?? 1, locale)
      let companyId: number | null = null
      if (row.companyCode?.trim()) {
        const company = await db.queryOne<{ id: number }>({
          text: 'SELECT id FROM companies WHERE code = ?',
          params: [row.companyCode.trim()],
        })
        if (!company) throw new Error(`companyCode not found: ${row.companyCode.trim()}`)
        companyId = company.id
      }
      const existing = await db.queryOne<{ id: number; credential_user_id: string }>({
        text: 'SELECT id, credential_user_id FROM biz_users WHERE lower(email) = lower(?)',
        params: [row.email.trim()],
      })
      const now = new Date().toISOString()
      if (existing) {
        await db.run({
          text: `UPDATE biz_users SET name_zh = ?, name_en = ?, phone = ?, role = ?, company_id = ?, status = ?, updated_at = ?
                 WHERE id = ?`,
          params: [row.nameZh.trim(), row.nameEn?.trim() ?? '', row.phone?.trim() || null, row.role, companyId, status, now, existing.id],
        })
      } else {
        // Imported users get a random password the admin can reset later.
        const platformUser = await userStore.create(
          {
            name: row.nameZh.trim(),
            email: row.email.trim(),
            phone: row.phone?.trim() || null,
            companyId: null,
            enabled: status === 1,
            passwordChangeRequired: true,
          },
          hashPassword(randomUUID().replace(/-/g, '')),
        )
        await db.run({
          text: `INSERT INTO biz_users (credential_user_id, name_zh, name_en, email, phone, role, company_id, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            platformUser.id,
            row.nameZh.trim(),
            row.nameEn?.trim() ?? '',
            row.email.trim(),
            row.phone?.trim() || null,
            row.role,
            companyId,
            status,
            now,
            now,
          ],
        })
      }
      applied += 1
    } catch (error) {
      failures.push({ row: index, reason: error instanceof Error ? error.message : 'invalid row' })
    }
  }
  if (failures.length > 0) {
    throw new ApiError(422, 'VALIDATION', locale === 'zh' ? '导入行校验失败' : 'Import rows failed validation', {
      rows: failures,
    })
  }
  await audit(db, {
    type: 'user.import',
    actorId: actor.id,
    summaryZh: `导入用户 ${applied} 行`,
    summaryEn: `Users imported: ${applied} rows`,
  })
  return applied
}
