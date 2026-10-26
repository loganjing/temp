import type { DbClient } from '@commonapp/dbkit'
import { randomUUID } from 'node:crypto'
import type {
  BusinessGroupRecord,
  BusinessGroupMemberRecord,
  AssignmentRuleRecord,
} from '../../shared/types'

const now = () => new Date().toISOString()

export interface GroupMemberWithUser extends BusinessGroupMemberRecord {
  user_name: string
  user_email: string
}

export function createGroupRepository(db: DbClient) {
  return {
    async createGroup(company_id: string, name: string): Promise<BusinessGroupRecord> {
      const id = randomUUID()
      const created_at = now()
      await db.run({
        text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)',
        params: [id, company_id, name, created_at],
      })
      return { id, company_id, name, created_at }
    },
    async getGroup(id: string): Promise<BusinessGroupRecord | null> {
      return db.queryOne({ text: 'SELECT id, company_id, name, created_at FROM business_groups WHERE id = ?', params: [id] })
    },
    async listGroups(company_id: string): Promise<BusinessGroupRecord[]> {
      return db.queryAll({
        text: 'SELECT id, company_id, name, created_at FROM business_groups WHERE company_id = ? ORDER BY created_at, id',
        params: [company_id],
      })
    },
    async addMember(group_id: string, user_id: string): Promise<{ created: boolean; member: BusinessGroupMemberRecord | null }> {
      const existing = await db.queryOne({ text: 'SELECT id FROM business_group_members WHERE group_id = ? AND user_id = ?', params: [group_id, user_id] })
      if (existing) return { created: false, member: existing as BusinessGroupMemberRecord }
      const id = randomUUID()
      const created_at = now()
      await db.run({
        text: 'INSERT INTO business_group_members (id, group_id, user_id, created_at) VALUES (?, ?, ?, ?)',
        params: [id, group_id, user_id, created_at],
      })
      return { created: true, member: { id, group_id, user_id, created_at } }
    },
    async listMembers(group_id: string): Promise<BusinessGroupMemberRecord[]> {
      return db.queryAll({
        text: 'SELECT id, group_id, user_id, created_at FROM business_group_members WHERE group_id = ? ORDER BY created_at, id',
        params: [group_id],
      })
    },
    async removeMember(group_id: string, user_id: string): Promise<boolean> {
      const result = await db.run({
        text: 'DELETE FROM business_group_members WHERE group_id = ? AND user_id = ?',
        params: [group_id, user_id],
      })
      return result.changes === 1
    },
    async memberExists(group_id: string, user_id: string): Promise<boolean> {
      const row = await db.queryOne({ text: 'SELECT 1 AS hit FROM business_group_members WHERE group_id = ? AND user_id = ?', params: [group_id, user_id] })
      return Boolean(row)
    },
    async groupsForUser(user_id: string): Promise<string[]> {
      const rows = await db.queryAll<{ group_id: string }>({
        text: 'SELECT group_id AS group_id FROM business_group_members WHERE user_id = ?',
        params: [user_id],
      })
      return rows.map((row) => row.group_id)
    },

    async createRule(company_id: string, category: string, business_group_id: string): Promise<AssignmentRuleRecord> {
      const id = randomUUID()
      const created_at = now()
      await db.run({
        text: 'INSERT INTO assignment_rules (id, company_id, category, business_group_id, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [id, company_id, category, business_group_id, created_at],
      })
      return { id, company_id, category, business_group_id, created_at }
    },
    async findRule(company_id: string, category: string): Promise<AssignmentRuleRecord | null> {
      return db.queryOne({
        text: 'SELECT id, company_id, category, business_group_id, created_at FROM assignment_rules WHERE company_id = ? AND category = ?',
        params: [company_id, category],
      })
    },
    async listRules(company_id: string): Promise<AssignmentRuleRecord[]> {
      return db.queryAll({
        text: 'SELECT id, company_id, category, business_group_id, created_at FROM assignment_rules WHERE company_id = ? ORDER BY created_at, id',
        params: [company_id],
      })
    },
    async deleteRule(id: string, company_id: string): Promise<boolean> {
      const result = await db.run({ text: 'DELETE FROM assignment_rules WHERE id = ? AND company_id = ?', params: [id, company_id] })
      return result.changes === 1
    },
  }
}
