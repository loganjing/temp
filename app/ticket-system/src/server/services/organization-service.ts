import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import type {
  CompanyDTO,
  DepartmentDTO,
  BusinessGroupDTO,
  GroupMemberDTO,
  AssignmentRuleDTO,
} from '../../shared/types'

export function createOrganizationService(db: DbClient) {
  async function listCompanies(): Promise<CompanyDTO[]> {
    const rows = await db.queryAll<{ id: string; name: string; created_at: number }>({
      text: 'SELECT id, name, created_at FROM companies ORDER BY created_at ASC',
    })
    return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }))
  }

  async function createCompany(name: string): Promise<CompanyDTO> {
    const id = randomUUID()
    const now = Date.now()
    await db.run({
      text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)',
      params: [id, name, now],
    })
    return { id, name, createdAt: now }
  }

  async function companyExists(companyId: string): Promise<boolean> {
    const row = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM companies WHERE id = ?', params: [companyId] })
    return !!row
  }

  async function listDepartments(companyId: string): Promise<DepartmentDTO[]> {
    const rows = await db.queryAll<{ id: string; company_id: string; name: string; created_at: number }>({
      text: 'SELECT id, company_id, name, created_at FROM departments WHERE company_id = ? ORDER BY created_at ASC',
      params: [companyId],
    })
    return rows.map((r) => ({ id: r.id, companyId: r.company_id, name: r.name, createdAt: r.created_at }))
  }

  async function createDepartment(companyId: string, name: string): Promise<DepartmentDTO> {
    const id = randomUUID()
    const now = Date.now()
    await db.run({
      text: 'INSERT INTO departments (id, company_id, name, created_at) VALUES (?, ?, ?, ?)',
      params: [id, companyId, name, now],
    })
    return { id, companyId, name, createdAt: now }
  }

  async function listGroups(companyId: string): Promise<BusinessGroupDTO[]> {
    const rows = await db.queryAll<{ id: string; company_id: string; name: string; created_at: number; member_count: number }>({
      text: `SELECT bg.id, bg.company_id, bg.name, bg.created_at,
               (SELECT COUNT(*) FROM business_group_members m WHERE m.group_id = bg.id) AS member_count
             FROM business_groups bg WHERE bg.company_id = ? ORDER BY bg.created_at ASC`,
      params: [companyId],
    })
    return rows.map((r) => ({ id: r.id, companyId: r.company_id, name: r.name, memberCount: r.member_count, createdAt: r.created_at }))
  }

  async function createGroup(companyId: string, name: string): Promise<BusinessGroupDTO> {
    const id = randomUUID()
    const now = Date.now()
    await db.run({
      text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)',
      params: [id, companyId, name, now],
    })
    return { id, companyId, name, memberCount: 0, createdAt: now }
  }

  async function groupExistsInCompany(groupId: string, companyId: string): Promise<boolean> {
    const row = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?',
      params: [groupId, companyId],
    })
    return !!row
  }

  async function listMembers(companyId: string, groupId: string): Promise<GroupMemberDTO[]> {
    const rows = await db.queryAll<{ id: string; group_id: string; user_id: string; full_name: string | null; name: string; email: string; created_at: number }>({
      text: `SELECT m.id, m.group_id, m.user_id, COALESCE(up.full_name, u.name) AS full_name, u.name, u.email, m.created_at
             FROM business_group_members m
             JOIN users u ON u.id = m.user_id
             LEFT JOIN user_profiles up ON up.user_id = m.user_id
             JOIN business_groups bg ON bg.id = m.group_id
             WHERE m.group_id = ? AND bg.company_id = ?
             ORDER BY m.created_at ASC`,
      params: [groupId, companyId],
    })
    return rows.map((r) => ({
      id: r.id, groupId: r.group_id, userId: r.user_id,
      fullName: r.full_name ?? r.name, email: r.email, createdAt: r.created_at,
    }))
  }

  async function addMember(companyId: string, groupId: string, userId: string): Promise<GroupMemberDTO | null> {
    if (!await groupExistsInCompany(groupId, companyId)) return null
    const existing = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM business_group_members WHERE group_id = ? AND user_id = ?',
      params: [groupId, userId],
    })
    if (existing) return null // conflict

    const id = randomUUID()
    const now = Date.now()
    await db.run({
      text: 'INSERT INTO business_group_members (id, group_id, user_id, created_at) VALUES (?, ?, ?, ?)',
      params: [id, groupId, userId, now],
    })
    const row = await db.queryOne<{ id: string; group_id: string; user_id: string; full_name: string | null; name: string; email: string; created_at: number }>({
      text: `SELECT m.id, m.group_id, m.user_id, COALESCE(up.full_name, u.name) AS full_name, u.name, u.email, m.created_at
             FROM business_group_members m
             JOIN users u ON u.id = m.user_id
             LEFT JOIN user_profiles up ON up.user_id = m.user_id
             WHERE m.id = ?`,
      params: [id],
    })
    return {
      id: row!.id, groupId: row!.group_id, userId: row!.user_id,
      fullName: row!.full_name ?? row!.name, email: row!.email, createdAt: row!.created_at,
    }
  }

  async function removeMember(companyId: string, groupId: string, userId: string): Promise<boolean> {
    if (!await groupExistsInCompany(groupId, companyId)) return false
    const result = await db.run({
      text: 'DELETE FROM business_group_members WHERE group_id = ? AND user_id = ?',
      params: [groupId, userId],
    })
    return result.changes === 1
  }

  async function isMember(groupId: string, userId: string): Promise<boolean> {
    const row = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM business_group_members WHERE group_id = ? AND user_id = ?',
      params: [groupId, userId],
    })
    return !!row
  }

  async function listAssignmentRules(companyId: string): Promise<AssignmentRuleDTO[]> {
    const rows = await db.queryAll<{ id: string; company_id: string; category: string; group_id: string; group_name: string; created_at: number }>({
      text: `SELECT r.id, r.company_id, r.category, r.group_id, bg.name AS group_name, r.created_at
             FROM category_assignment_rules r
             JOIN business_groups bg ON bg.id = r.group_id
             WHERE r.company_id = ?
             ORDER BY r.created_at ASC`,
      params: [companyId],
    })
    return rows.map((r) => ({
      id: r.id, companyId: r.company_id, category: r.category,
      groupId: r.group_id, groupName: r.group_name, createdAt: r.created_at,
    }))
  }

  async function createAssignmentRule(companyId: string, category: string, groupId: string): Promise<AssignmentRuleDTO | null> {
    if (!await groupExistsInCompany(groupId, companyId)) return null
    const existing = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM category_assignment_rules WHERE company_id = ? AND category = ?',
      params: [companyId, category],
    })
    if (existing) return null // conflict

    const id = randomUUID()
    const now = Date.now()
    await db.run({
      text: 'INSERT INTO category_assignment_rules (id, company_id, category, group_id, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [id, companyId, category, groupId, now],
    })
    const row = await db.queryOne<{ id: string; company_id: string; category: string; group_id: string; group_name: string; created_at: number }>({
      text: `SELECT r.id, r.company_id, r.category, r.group_id, bg.name AS group_name, r.created_at
             FROM category_assignment_rules r
             JOIN business_groups bg ON bg.id = r.group_id
             WHERE r.id = ?`,
      params: [id],
    })
    return {
      id: row!.id, companyId: row!.company_id, category: row!.category,
      groupId: row!.group_id, groupName: row!.group_name, createdAt: row!.created_at,
    }
  }

  return {
    listCompanies, createCompany, companyExists,
    listDepartments, createDepartment,
    listGroups, createGroup, groupExistsInCompany,
    listMembers, addMember, removeMember, isMember,
    listAssignmentRules, createAssignmentRule,
  }
}
