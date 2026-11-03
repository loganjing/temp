import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import type { UserStore } from '@commonapp/userkit'
import type {
  CompanyItem, DepartmentItem, BusinessGroupItem, BusinessGroupMember,
  RoutingRuleItem, UserListItem,
} from '../../shared/types'

export function createOrganizationRepository(db: DbClient, userStore: UserStore) {
  async function listCompanies(): Promise<CompanyItem[]> {
    return db.queryAll<CompanyItem>({
      text: 'SELECT id, name FROM companies ORDER BY name ASC',
    })
  }

  async function createCompany(name: string): Promise<CompanyItem> {
    const id = randomUUID()
    const now = new Date().toISOString()
    await db.run({ text: 'INSERT INTO companies (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', params: [id, name, now, now] })
    return { id, name }
  }

  async function listDepartments(companyId: string): Promise<DepartmentItem[]> {
    return db.queryAll<DepartmentItem>({
      text: 'SELECT id, name, company_id AS companyId FROM departments WHERE company_id = ? ORDER BY name ASC',
      params: [companyId],
    })
  }

  async function createDepartment(companyId: string, name: string): Promise<DepartmentItem> {
    const id = randomUUID()
    const now = new Date().toISOString()
    await db.run({ text: 'INSERT INTO departments (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [id, companyId, name, now] })
    return { id, name, companyId }
  }

  async function listBusinessGroups(companyId: string): Promise<BusinessGroupItem[]> {
    const groups = await db.queryAll<{ id: string; name: string; company_id: string }>({
      text: 'SELECT id, name, company_id FROM business_groups WHERE company_id = ? ORDER BY name ASC',
      params: [companyId],
    })
    if (!groups.length) return []
    const groupIds = groups.map((g) => g.id)
    const placeholders = groupIds.map(() => '?').join(',')
    const members = await db.queryAll<{ group_id: string; user_id: string; name: string }>({
      text: `SELECT m.group_id, m.user_id, u.name FROM business_group_members m
             JOIN users u ON m.user_id = u.id
             WHERE m.group_id IN (${placeholders}) ORDER BY u.name ASC`,
      params: groupIds,
    })
    return groups.map((g) => ({
      id: g.id, name: g.name, companyId: g.company_id,
      members: members.filter((m) => m.group_id === g.id).map((m) => ({ userId: m.user_id, userName: m.name })),
    }))
  }

  async function findBusinessGroupById(id: string): Promise<{ id: string; company_id: string; name: string } | null> {
    return db.queryOne<{ id: string; company_id: string; name: string }>({
      text: 'SELECT id, company_id, name FROM business_groups WHERE id = ?',
      params: [id],
    })
  }

  async function createBusinessGroup(companyId: string, name: string): Promise<{ id: string; name: string; companyId: string }> {
    const id = randomUUID()
    const now = new Date().toISOString()
    await db.run({ text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [id, companyId, name, now] })
    return { id, name, companyId }
  }

  async function isGroupMember(groupId: string, userId: string): Promise<boolean> {
    const row = await db.queryOne<{ c: number }>({
      text: 'SELECT COUNT(*) AS c FROM business_group_members WHERE group_id = ? AND user_id = ?',
      params: [groupId, userId],
    })
    return Number(row?.c ?? 0) > 0
  }

  async function addGroupMember(groupId: string, userId: string): Promise<void> {
    const now = new Date().toISOString()
    await db.run({ text: 'INSERT INTO business_group_members (group_id, user_id, created_at) VALUES (?, ?, ?)', params: [groupId, userId, now] })
  }

  async function removeGroupMember(groupId: string, userId: string): Promise<boolean> {
    const result = await db.run({ text: 'DELETE FROM business_group_members WHERE group_id = ? AND user_id = ?', params: [groupId, userId] })
    return result.changes === 1
  }

  async function listRoutingRules(companyId: string): Promise<RoutingRuleItem[]> {
    return db.queryAll<RoutingRuleItem>({
      text: `SELECT r.id, r.company_id AS companyId, r.category, r.business_group_id AS businessGroupId,
                    bg.name AS businessGroupName
             FROM category_routing_rules r
             JOIN business_groups bg ON r.business_group_id = bg.id
             WHERE r.company_id = ? ORDER BY r.category ASC`,
      params: [companyId],
    })
  }

  async function findRoutingRule(companyId: string, category: string): Promise<{ id: string; business_group_id: string } | null> {
    return db.queryOne<{ id: string; business_group_id: string }>({
      text: 'SELECT id, business_group_id FROM category_routing_rules WHERE company_id = ? AND category = ?',
      params: [companyId, category],
    })
  }

  async function createRoutingRule(companyId: string, category: string, businessGroupId: string): Promise<{ id: string; companyId: string; category: string; businessGroupId: string }> {
    const id = randomUUID()
    const now = new Date().toISOString()
    await db.run({ text: 'INSERT INTO category_routing_rules (id, company_id, category, business_group_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [id, companyId, category, businessGroupId, now] })
    return { id, companyId, category, businessGroupId }
  }

  async function listUsers(filters: { companyId?: string; search?: string; page?: number; pageSize?: number }): Promise<{ items: UserListItem[]; total: number }> {
    const where: string[] = []
    const params: unknown[] = []
    if (filters.companyId) { where.push('u.company_id = ?'); params.push(filters.companyId) }
    if (filters.search?.trim()) {
      where.push('(LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ?)')
      const q = `%${filters.search.trim().toLowerCase()}%`
      params.push(q, q)
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const page = Math.max(filters.page ?? 1, 1)
    const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 100)
    const offset = (page - 1) * pageSize
    const items = await db.queryAll<UserListItem>({
      text: `SELECT u.id, u.name, u.email, u.phone, u.company_id AS companyId,
                    d.name AS departmentName
             FROM users u
             LEFT JOIN user_departments ud ON ud.user_id = u.id
             LEFT JOIN departments d ON ud.department_id = d.id
             ${whereClause}
             ORDER BY u.name ASC, u.id ASC LIMIT ? OFFSET ?`,
      params: [...params, pageSize, offset],
    })
    const totalRow = await db.queryOne<{ total: number }>({
      text: `SELECT COUNT(*) AS total FROM users u ${whereClause}`,
      params,
    })
    return { items, total: Number(totalRow?.total ?? 0) }
  }

  async function findUserDepartment(userId: string): Promise<{ id: string; name: string } | null> {
    return db.queryOne<{ id: string; name: string }>({
      text: `SELECT d.id, d.name FROM user_departments ud
             JOIN departments d ON ud.department_id = d.id
             WHERE ud.user_id = ?`,
      params: [userId],
    })
  }

  async function assignDepartment(userId: string, departmentId: string): Promise<void> {
    await db.run({ text: 'INSERT INTO user_departments (user_id, department_id) VALUES (?, ?)', params: [userId, departmentId] })
  }

  async function createUserWithDepartment(input: {
    name: string; email: string; phone?: string | null; password: string
    companyId?: string | null; departmentId?: string
    passwordHash: string
  }): Promise<{ id: string; name: string; email: string; companyId: string | null }> {
    const user = await userStore.create({
      name: input.name, email: input.email, phone: input.phone ?? null,
      companyId: input.companyId ?? null, passwordChangeRequired: true,
    }, input.passwordHash)
    if (input.departmentId) {
      await db.run({ text: 'INSERT INTO user_departments (user_id, department_id) VALUES (?, ?)', params: [user.id, input.departmentId] })
    }
    return { id: user.id, name: user.name, email: user.email, companyId: user.companyId ?? null }
  }

  return {
    listCompanies, createCompany, listDepartments, createDepartment,
    listBusinessGroups, findBusinessGroupById, createBusinessGroup,
    isGroupMember, addGroupMember, removeGroupMember,
    listRoutingRules, findRoutingRule, createRoutingRule,
    listUsers, findUserDepartment, assignDepartment, createUserWithDepartment,
  }
}

export type OrganizationRepository = ReturnType<typeof createOrganizationRepository>
