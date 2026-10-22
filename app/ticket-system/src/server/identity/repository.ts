import type { DbClient } from '@commonapp/dbkit'
import { ROLE_CODES, type RoleCode } from '../../shared/contracts'
import { likeContains } from '../platform/http'

const isRoleCode = (value: string): value is RoleCode => (ROLE_CODES as readonly string[]).includes(value)

export type MemberContext = {
  memberId: string
  userId: string
  displayName: string
  email: string
  isActive: boolean
  companyId: string
  companyName: string
  departmentId: string | null
  departmentName: string | null
  roles: RoleCode[]
}

export type CompanyMemberRow = {
  memberId: string
  displayName: string
  email: string
  departmentId: string | null
  departmentName: string | null
  isActive: boolean
  roles: RoleCode[]
}

type MemberRow = {
  id: string
  user_id: string
  display_name: string
  email: string
  is_active: number
  company_id: string
  company_name: string
  department_id: string | null
  department_name: string | null
}

/** identity-access 只读查询：公司/部门归属、成员标识与成员角色。 */
export function createIdentityRepository(db: DbClient) {
  const rolesOf = async (memberId: string): Promise<RoleCode[]> => {
    const rows = await db.queryAll<{ role_code: string }>({ text: 'SELECT role_code FROM company_member_roles WHERE member_id = ? ORDER BY role_code', params: [memberId] })
    return rows.map((row) => row.role_code).filter(isRoleCode)
  }

  return {
    /** 由可信会话中的本地账号解析业务成员上下文；无成员时返回 null（调用方按 403 处理）。 */
    async findMemberContextByUserId(userId: string): Promise<MemberContext | null> {
      const row = await db.queryOne<MemberRow>({
        text: `SELECT m.id, m.user_id, m.display_name, m.email, m.is_active, m.company_id, c.name AS company_name, m.department_id, d.name AS department_name
               FROM company_members m
               JOIN companies c ON c.id = m.company_id
               LEFT JOIN departments d ON d.id = m.department_id
               WHERE m.user_id = ?`,
        params: [userId],
      })
      if (!row) return null
      return {
        memberId: row.id,
        userId: row.user_id,
        displayName: row.display_name,
        email: row.email,
        isActive: Boolean(row.is_active),
        companyId: row.company_id,
        companyName: row.company_name,
        departmentId: row.department_id,
        departmentName: row.department_name,
        roles: await rolesOf(row.id),
      }
    },

    async listCompanyMembers(companyId: string, options: { activeOnly: boolean; search: string | null }): Promise<CompanyMemberRow[]> {
      const conditions = ['m.company_id = ?']
      const params: unknown[] = [companyId]
      if (options.activeOnly) conditions.push('m.is_active = 1')
      if (options.search) {
        conditions.push("(m.display_name LIKE ? ESCAPE '\\' OR m.email LIKE ? ESCAPE '\\')")
        params.push(likeContains(options.search), likeContains(options.search))
      }
      const rows = await db.queryAll<MemberRow & { role_code: string | null }>({
        text: `SELECT m.id, m.user_id, m.display_name, m.email, m.is_active, m.company_id, c.name AS company_name, m.department_id, d.name AS department_name, r.role_code
               FROM company_members m
               JOIN companies c ON c.id = m.company_id
               LEFT JOIN departments d ON d.id = m.department_id
               LEFT JOIN company_member_roles r ON r.member_id = m.id
               WHERE ${conditions.join(' AND ')}
               ORDER BY m.display_name ASC, m.id ASC, r.role_code ASC`,
        params,
      })
      const grouped = new Map<string, CompanyMemberRow>()
      for (const row of rows) {
        const member = grouped.get(row.id) ?? {
          memberId: row.id,
          displayName: row.display_name,
          email: row.email,
          departmentId: row.department_id,
          departmentName: row.department_name,
          isActive: Boolean(row.is_active),
          roles: [] as RoleCode[],
        }
        if (row.role_code && isRoleCode(row.role_code)) member.roles.push(row.role_code)
        grouped.set(row.id, member)
      }
      return [...grouped.values()]
    },

    /** 成员必须属于给定公司且启用；用于跨公司与归属校验（不匹配按不存在处理）。 */
    async findActiveMember(companyId: string, memberId: string): Promise<{ memberId: string; displayName: string } | null> {
      const row = await db.queryOne<{ id: string; display_name: string }>({
        text: 'SELECT id, display_name FROM company_members WHERE id = ? AND company_id = ? AND is_active = 1',
        params: [memberId, companyId],
      })
      return row ? { memberId: row.id, displayName: row.display_name } : null
    },

    async findMember(companyId: string, memberId: string): Promise<{ memberId: string; displayName: string; isActive: boolean } | null> {
      const row = await db.queryOne<{ id: string; display_name: string; is_active: number }>({
        text: 'SELECT id, display_name, is_active FROM company_members WHERE id = ? AND company_id = ?',
        params: [memberId, companyId],
      })
      return row ? { memberId: row.id, displayName: row.display_name, isActive: Boolean(row.is_active) } : null
    },

    async memberIdsInCompany(companyId: string, memberIds: readonly string[]): Promise<Set<string>> {
      if (memberIds.length === 0) return new Set()
      const placeholders = memberIds.map(() => '?').join(', ')
      const rows = await db.queryAll<{ id: string }>({
        text: `SELECT id FROM company_members WHERE company_id = ? AND id IN (${placeholders})`,
        params: [companyId, ...memberIds],
      })
      return new Set(rows.map((row) => row.id))
    },
  }
}

export type IdentityRepository = ReturnType<typeof createIdentityRepository>
