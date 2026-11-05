import type { DbClient } from '@commonapp/dbkit'
import type { PermissionRegistry } from '@commonapp/permissionkit'
import type { CompanyUser, GroupRef, UserProfile } from '../../shared/ticket-contracts'
import { ROLE_AGENT, ROLE_COMPANY_ADMIN, ROLE_PLATFORM_STATS } from '../../shared/ticket-contracts'
import { forbidden, notFound, validationFailed } from '../errors'
import type { createPermissions } from '../platform/permissions'

const ROLE_ORDER = [ROLE_COMPANY_ADMIN, ROLE_AGENT, ROLE_PLATFORM_STATS]

export type Identity = {
  id: string
  name: string
  email: string
  enabled: boolean
  companyId: string
  companyName: string
  department: string
  roles: string[]
  groups: GroupRef[]
  isCompanyAdmin: boolean
  isAgent: boolean
  isPlatformStats: boolean
}

export type CompanyUserRecord = CompanyUser & { phone: string | null }

type IdentityRow = {
  id: string
  name: string
  email: string
  enabled: number
  company_id: string
  company_name: string
  department: string
}

type CompanyUserRow = IdentityRow & { phone: string | null }

export function createIdentityService(db: DbClient, permissions: ReturnType<typeof createPermissions>) {
  const findRow = (userId: string) =>
    db.queryOne<IdentityRow>({
      text: `SELECT u.id, u.name, u.email, u.enabled, p.company_id, p.department, c.name AS company_name
             FROM users u
             JOIN user_profiles p ON p.user_id = u.id
             JOIN companies c ON c.id = p.company_id
             WHERE u.id = ?`,
      params: [userId],
    })

  async function resolveRoles(userId: string, companyId: string) {
    const context = await permissions.loadAuthorizationContext(userId)
    const companyScoped = context.scopes.some((scope) => scope.type === 'company' && scope.id === companyId)
    const has = (role: string) => context.roles.includes(role)
    return {
      roles: ROLE_ORDER.filter(has),
      isCompanyAdmin: has(ROLE_COMPANY_ADMIN) && companyScoped,
      isAgent: has(ROLE_AGENT) && companyScoped,
      isPlatformStats: has(ROLE_PLATFORM_STATS),
    }
  }

  async function listGroups(userId: string, companyId: string): Promise<GroupRef[]> {
    const rows = await db.queryAll<{ id: string; name: string }>({
      text: `SELECT g.id, g.name
             FROM business_group_members m
             JOIN business_groups g ON g.id = m.group_id
             WHERE m.user_id = ? AND m.company_id = ? AND g.company_id = ?
             ORDER BY g.name, g.id`,
      params: [userId, companyId, companyId],
    })
    return rows.map((row) => ({ id: row.id, name: row.name }))
  }

  async function toIdentity(row: IdentityRow): Promise<Identity> {
    const companyId = row.company_id
    const resolved = await resolveRoles(row.id, companyId)
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      enabled: Boolean(row.enabled),
      companyId,
      companyName: row.company_name,
      department: row.department,
      roles: resolved.roles,
      groups: await listGroups(row.id, companyId),
      isCompanyAdmin: resolved.isCompanyAdmin,
      isAgent: resolved.isAgent,
      isPlatformStats: resolved.isPlatformStats,
    }
  }

  async function getById(userId: string): Promise<Identity | null> {
    const row = await findRow(userId)
    return row ? toIdentity(row) : null
  }

  function toProfile(identity: Identity): UserProfile {
    return {
      id: identity.id,
      name: identity.name,
      email: identity.email,
      companyId: identity.companyId,
      companyName: identity.companyName,
      department: identity.department,
      roles: identity.roles,
      groups: identity.groups,
    }
  }

  function requireCompanyAdmin(identity: Identity): Identity {
    if (!identity.isCompanyAdmin) throw forbidden('仅公司管理员可执行该操作')
    return identity
  }

  function canHandleGroup(identity: Identity, groupId: string | null): boolean {
    if (identity.isCompanyAdmin) return true
    return Boolean(groupId) && identity.isAgent && identity.groups.some((group) => group.id === groupId)
  }

  function requireGroupHandler(identity: Identity, groupId: string | null): Identity {
    if (!canHandleGroup(identity, groupId)) throw forbidden('仅该工单所属业务组成员或公司管理员可执行该操作')
    return identity
  }

  function requireTicketUser(identity: Identity): Identity {
    if (identity.isPlatformStats && !identity.isCompanyAdmin && !identity.isAgent) throw forbidden('平台统计角色仅可查看聚合统计')
    return identity
  }

  async function listCompanyUserRecords(companyId: string, search = ''): Promise<CompanyUserRecord[]> {
    const q = `%${search.trim().toLowerCase()}%`
    const rows = await db.queryAll<CompanyUserRow>({
      text: `SELECT u.id, u.name, u.email, u.phone, u.enabled, p.company_id, p.department, c.name AS company_name
             FROM users u
             JOIN user_profiles p ON p.user_id = u.id
             JOIN companies c ON c.id = p.company_id
             WHERE p.company_id = ?
               AND (lower(u.name) LIKE ? OR lower(u.email) LIKE ? OR lower(p.department) LIKE ?)
             ORDER BY u.name, u.id`,
      params: [companyId, q, q, q],
    })
    return Promise.all(
      rows.map(async (row) => {
        const identity = await toIdentity(row)
        return {
          id: identity.id,
          name: identity.name,
          email: identity.email,
          phone: row.phone,
          department: identity.department,
          enabled: identity.enabled,
          roles: identity.roles,
          groups: identity.groups,
        }
      }),
    )
  }

  async function getCompanyUserRecord(companyId: string, userId: string): Promise<CompanyUserRecord | null> {
    const row = await db.queryOne<CompanyUserRow>({
      text: `SELECT u.id, u.name, u.email, u.phone, u.enabled, p.company_id, p.department, c.name AS company_name
             FROM users u
             JOIN user_profiles p ON p.user_id = u.id
             JOIN companies c ON c.id = p.company_id
             WHERE p.company_id = ? AND u.id = ?`,
      params: [companyId, userId],
    })
    if (!row) return null
    const identity = await toIdentity(row)
    return {
      id: identity.id,
      name: identity.name,
      email: identity.email,
      phone: row.phone,
      department: identity.department,
      enabled: identity.enabled,
      roles: identity.roles,
      groups: identity.groups,
    }
  }

  async function updateCompanyUser(
    companyId: string,
    userId: string,
    input: { department?: string; enabled?: boolean },
  ): Promise<CompanyUserRecord> {
    const existing = await getCompanyUserRecord(companyId, userId)
    if (!existing) {
      const elsewhere = await db.queryOne<{ user_id: string }>({ text: 'SELECT user_id FROM user_profiles WHERE user_id = ?', params: [userId] })
      throw elsewhere ? forbidden('不能修改其他公司的用户') : notFound('用户不存在')
    }
    const now = new Date().toISOString()
    await db.transaction(async (tx) => {
      if (input.department !== undefined) {
        await tx.run({
          text: 'UPDATE user_profiles SET department = ?, updated_at = ? WHERE user_id = ? AND company_id = ?',
          params: [input.department, now, userId, companyId],
        })
      }
      if (input.enabled !== undefined) {
        await tx.run({ text: 'UPDATE users SET enabled = ?, updated_at = ? WHERE id = ?', params: [input.enabled ? 1 : 0, now, userId] })
      }
    })
    const updated = await getCompanyUserRecord(companyId, userId)
    if (!updated) throw notFound('用户不存在')
    return updated
  }

  async function createProfile(companyId: string, userId: string, department: string): Promise<void> {
    const company = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM companies WHERE id = ?', params: [companyId] })
    if (!company) throw validationFailed('提交内容有误，请检查后重试', { companyId: '公司不存在' })
    const now = new Date().toISOString()
    await db.run({
      text: `INSERT INTO user_profiles (user_id, company_id, department, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET company_id = excluded.company_id, department = excluded.department, updated_at = excluded.updated_at`,
      params: [userId, companyId, department, now, now],
    })
  }

  return {
    getById,
    toProfile,
    requireCompanyAdmin,
    requireGroupHandler,
    requireTicketUser,
    canHandleGroup,
    listCompanyUserRecords,
    getCompanyUserRecord,
    updateCompanyUser,
    createProfile,
  }
}

export type IdentityService = ReturnType<typeof createIdentityService>
