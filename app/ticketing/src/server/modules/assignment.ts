import type { DbClient } from '@commonapp/dbkit'
import type { AssignmentRule, Group, GroupMember } from '../../shared/contracts'
import { now } from './util'

interface MemberRow {
  id: string
  name: string
  email: string
  department: string | null
}

async function loadGroupMembers(db: DbClient, groupId: number): Promise<GroupMember[]> {
  const rows = await db.queryAll<MemberRow>({
    text: `SELECT u.id, u.name, u.email, u.department
           FROM group_members gm JOIN users u ON u.id = gm.user_id
           WHERE gm.group_id = ?
           ORDER BY u.name, u.id`,
    params: [groupId],
  })
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, department: r.department ?? '' }))
}

interface GroupRow {
  id: number
  name: string
  company_id: number
}

async function mapGroup(db: DbClient, row: GroupRow): Promise<Group> {
  return {
    id: row.id,
    name: row.name,
    companyId: row.company_id,
    members: await loadGroupMembers(db, row.id),
  }
}

export async function listGroups(db: DbClient, companyId: number): Promise<Group[]> {
  const rows = await db.queryAll<GroupRow>({
    text: 'SELECT id, name, company_id FROM groups WHERE company_id = ? ORDER BY name, id',
    params: [companyId],
  })
  const groups: Group[] = []
  for (const row of rows) groups.push(await mapGroup(db, row))
  return groups
}

export async function findGroup(db: DbClient, groupId: number, companyId: number): Promise<GroupRow | null> {
  return db.queryOne<GroupRow>({
    text: 'SELECT id, name, company_id FROM groups WHERE id = ? AND company_id = ?',
    params: [groupId, companyId],
  })
}

export async function createGroup(db: DbClient, companyId: number, name: string): Promise<Group> {
  const ts = now()
  await db.run({
    text: 'INSERT INTO groups (name, company_id, created_at) VALUES (?, ?, ?)',
    params: [name, companyId, ts],
  })
  const row = await db.queryOne<GroupRow>({
    text: 'SELECT id, name, company_id FROM groups WHERE company_id = ? AND name = ?',
    params: [companyId, name],
  })
  return mapGroup(db, row!)
}

export async function updateGroupName(db: DbClient, groupId: number, companyId: number, name: string): Promise<Group | null> {
  const result = await db.run({
    text: 'UPDATE groups SET name = ? WHERE id = ? AND company_id = ?',
    params: [name, groupId, companyId],
  })
  if (result.changes !== 1) return null
  const row = await db.queryOne<GroupRow>({
    text: 'SELECT id, name, company_id FROM groups WHERE id = ?',
    params: [groupId],
  })
  return row ? mapGroup(db, row) : null
}

export async function deleteGroup(db: DbClient, groupId: number, companyId: number): Promise<boolean> {
  const inUse = await db.queryOne<{ total: number }>({
    text: `SELECT COUNT(*) AS total FROM tickets
           WHERE current_group_id = ? AND status IN ('pending_assignment', 'processing')`,
    params: [groupId],
  })
  if (Number(inUse?.total ?? 0) > 0) return false
  const result = await db.run({ text: 'DELETE FROM groups WHERE id = ? AND company_id = ?', params: [groupId, companyId] })
  return result.changes === 1
}

export async function isGroupMember(db: DbClient, groupId: number, userId: string): Promise<boolean> {
  const row = await db.queryOne<{ total: number }>({
    text: 'SELECT COUNT(*) AS total FROM group_members WHERE group_id = ? AND user_id = ?',
    params: [groupId, userId],
  })
  return Number(row?.total ?? 0) > 0
}

export async function addMember(db: DbClient, groupId: number, userId: string): Promise<boolean> {
  const result = await db.run({
    text: 'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
    params: [groupId, userId],
  })
  return result.changes === 1
}

export async function removeMember(db: DbClient, groupId: number, userId: string): Promise<boolean> {
  const result = await db.run({
    text: 'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
    params: [groupId, userId],
  })
  return result.changes === 1
}

interface RuleRow {
  id: number
  category: string
  group_id: number
  group_name: string
}

function mapRule(row: RuleRow): AssignmentRule {
  return { id: row.id, category: row.category, groupId: row.group_id, groupName: row.group_name }
}

export async function listRules(db: DbClient, companyId: number): Promise<AssignmentRule[]> {
  const rows = await db.queryAll<RuleRow>({
    text: `SELECT ar.id, ar.category, ar.group_id, g.name AS group_name
           FROM assignment_rules ar JOIN groups g ON g.id = ar.group_id
           WHERE ar.company_id = ?
           ORDER BY ar.category, ar.id`,
    params: [companyId],
  })
  return rows.map(mapRule)
}

export async function findRule(db: DbClient, ruleId: number, companyId: number): Promise<RuleRow | null> {
  return db.queryOne<RuleRow>({
    text: `SELECT ar.id, ar.category, ar.group_id, g.name AS group_name
           FROM assignment_rules ar JOIN groups g ON g.id = ar.group_id
           WHERE ar.id = ? AND ar.company_id = ?`,
    params: [ruleId, companyId],
  })
}

export async function createRule(db: DbClient, companyId: number, category: string, groupId: number): Promise<AssignmentRule> {
  const ts = now()
  await db.run({
    text: 'INSERT INTO assignment_rules (company_id, category, group_id, created_at) VALUES (?, ?, ?, ?)',
    params: [companyId, category, groupId, ts],
  })
  const row = await db.queryOne<RuleRow>({
    text: `SELECT ar.id, ar.category, ar.group_id, g.name AS group_name
           FROM assignment_rules ar JOIN groups g ON g.id = ar.group_id
           WHERE ar.company_id = ? AND ar.category = ?`,
    params: [companyId, category],
  })
  return mapRule(row!)
}

export async function updateRule(db: DbClient, ruleId: number, companyId: number, category: string, groupId: number): Promise<AssignmentRule | null> {
  const result = await db.run({
    text: 'UPDATE assignment_rules SET category = ?, group_id = ? WHERE id = ? AND company_id = ?',
    params: [category, groupId, ruleId, companyId],
  })
  if (result.changes !== 1) return null
  const row = await db.queryOne<RuleRow>({
    text: `SELECT ar.id, ar.category, ar.group_id, g.name AS group_name
           FROM assignment_rules ar JOIN groups g ON g.id = ar.group_id
           WHERE ar.id = ?`,
    params: [ruleId],
  })
  return row ? mapRule(row) : null
}

export async function deleteRule(db: DbClient, ruleId: number, companyId: number): Promise<boolean> {
  const result = await db.run({
    text: 'DELETE FROM assignment_rules WHERE id = ? AND company_id = ?',
    params: [ruleId, companyId],
  })
  return result.changes === 1
}
