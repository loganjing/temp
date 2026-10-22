import { randomUUID } from 'node:crypto'
import type { BusinessGroupDTO, MemberDTO } from '../../shared/types'
import { type ServiceContext, BusinessError, now } from './context'

export function createCollaborationService(ctx: ServiceContext) {
  const { db } = ctx

  return {
    async createBusinessGroup(companyId: string, name: string): Promise<BusinessGroupDTO> {
      const id = randomUUID()
      const ts = now()
      await db.run({
        text: 'INSERT INTO business_groups (id, name, company_id, created_at) VALUES (?, ?, ?, ?)',
        params: [id, name, companyId, ts],
      })
      return { id, name, companyId, members: [], createdAt: ts }
    },

    async listBusinessGroups(companyId: string): Promise<BusinessGroupDTO[]> {
      const groups = await db.queryAll<{ id: string; name: string; company_id: string; created_at: string }>({
        text: 'SELECT id, name, company_id, created_at FROM business_groups WHERE company_id = ? ORDER BY name',
        params: [companyId],
      })
      if (groups.length === 0) return []
      const groupIds = groups.map((g) => g.id)
      const placeholders = groupIds.map(() => '?').join(', ')
      const members = await db.queryAll<{
        id: string; group_id: string; user_id: string; user_name: string; email: string
      }>({
        text: `SELECT m.id, m.group_id, m.user_id, u.name AS user_name, u.email
               FROM business_group_members m
               LEFT JOIN users u ON m.user_id = u.id
               WHERE m.group_id IN (${placeholders})`,
        params: groupIds,
      })
      const membersByGroup = new Map<string, MemberDTO[]>()
      for (const m of members) {
        const list = membersByGroup.get(m.group_id) ?? []
        list.push({
          id: m.id,
          groupId: m.group_id,
          userId: m.user_id,
          userName: m.user_name,
          email: m.email,
        })
        membersByGroup.set(m.group_id, list)
      }
      return groups.map((g) => ({
        id: g.id,
        name: g.name,
        companyId: g.company_id,
        members: membersByGroup.get(g.id) ?? [],
        createdAt: g.created_at,
      }))
    },

    async addMember(companyId: string, groupId: string, userId: string): Promise<MemberDTO> {
      // Validate group belongs to company
      const group = await db.queryOne<{ company_id: string }>({ text: 'SELECT company_id FROM business_groups WHERE id = ?', params: [groupId] })
      if (!group || group.company_id !== companyId) throw new BusinessError('NOT_FOUND', '业务组不存在或不属于同公司', 404)
      // Validate target user belongs to same company
      const user = await db.queryOne<{ company_id: string | null; name: string; email: string }>({
        text: 'SELECT company_id, name, email FROM users WHERE id = ?',
        params: [userId],
      })
      if (!user || user.company_id !== companyId) throw new BusinessError('NOT_FOUND', '用户不存在或不属于同公司', 404)
      // Check for duplicate
      const existing = await db.queryOne<{ id: string }>({
        text: 'SELECT id FROM business_group_members WHERE group_id = ? AND user_id = ?',
        params: [groupId, userId],
      })
      if (existing) throw new BusinessError('CONFLICT', '该用户已是业务组成员', 409)

      const id = randomUUID()
      const ts = now()
      await db.run({
        text: 'INSERT INTO business_group_members (id, group_id, user_id, created_at) VALUES (?, ?, ?, ?)',
        params: [id, groupId, userId, ts],
      })
      return { id, groupId, userId, userName: user.name, email: user.email }
    },
  }
}
