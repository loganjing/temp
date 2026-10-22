import type { DbClient } from '@commonapp/dbkit'
import type { AssignmentRule, BusinessGroup, BusinessGroupMember, BusinessGroupSummary } from '../../shared/contracts'

export type GroupRecord = { id: string; name: string; description: string | null; createdAt: string; updatedAt: string }
export type RuleRecord = { id: string; category: string; groupId: string; groupName: string; createdAt: string; updatedAt: string }

type GroupRow = { id: string; name: string; description: string | null; created_at: string; updated_at: string }
type RuleRow = { id: string; category: string; group_id: string; group_name: string; created_at: string; updated_at: string }

const toGroup = (row: GroupRow): GroupRecord => ({ id: row.id, name: row.name, description: row.description, createdAt: row.created_at, updatedAt: row.updated_at })
const toRule = (row: RuleRow): RuleRecord => ({ id: row.id, category: row.category, groupId: row.group_id, groupName: row.group_name, createdAt: row.created_at, updatedAt: row.updated_at })

/** org-config 数据访问：业务组、组成员与“分类→业务组”规则，全部以 company_id 为范围。 */
export function createOrgRepository(db: DbClient) {
  return {
    async findRuleGroupId(companyId: string, category: string, client: DbClient = db): Promise<string | null> {
      const row = await client.queryOne<{ group_id: string }>({
        text: 'SELECT group_id FROM assignment_rules WHERE company_id = ? AND category = ?',
        params: [companyId, category],
      })
      return row?.group_id ?? null
    },

    async listGroups(companyId: string): Promise<BusinessGroupSummary[]> {
      const [rows, memberRows] = await Promise.all([
        db.queryAll<GroupRow & { member_count: number }>({
          text: `SELECT g.id, g.name, g.description, g.created_at, g.updated_at, COUNT(bgm.member_id) AS member_count
                 FROM business_groups g
                 LEFT JOIN business_group_members bgm ON bgm.group_id = g.id
                 WHERE g.company_id = ?
                 GROUP BY g.id, g.name, g.description, g.created_at, g.updated_at
                 ORDER BY g.name ASC, g.id ASC`,
          params: [companyId],
        }),
        // 成员随业务组读回（AC-06）：一次取全公司组成员，避免逐组查询。
        db.queryAll<{ group_id: string; member_id: string; display_name: string }>({
          text: `SELECT bgm.group_id, m.id AS member_id, m.display_name
                 FROM business_group_members bgm
                 JOIN business_groups g ON g.id = bgm.group_id
                 JOIN company_members m ON m.id = bgm.member_id
                 WHERE g.company_id = ?
                 ORDER BY m.display_name ASC, m.id ASC`,
          params: [companyId],
        }),
      ])
      const membersByGroup = new Map<string, BusinessGroupMember[]>()
      for (const row of memberRows) {
        const members = membersByGroup.get(row.group_id) ?? []
        members.push({ memberId: row.member_id, displayName: row.display_name })
        membersByGroup.set(row.group_id, members)
      }
      return rows.map((row) => {
        const members = membersByGroup.get(row.id) ?? []
        return { ...toGroup(row), memberCount: Number(row.member_count), memberIds: members.map((member) => member.memberId), members }
      })
    },

    async findGroup(companyId: string, groupId: string, client: DbClient = db): Promise<GroupRecord | null> {
      const row = await client.queryOne<GroupRow>({
        text: 'SELECT id, name, description, created_at, updated_at FROM business_groups WHERE id = ? AND company_id = ?',
        params: [groupId, companyId],
      })
      return row ? toGroup(row) : null
    },

    async findGroupByName(companyId: string, name: string, client: DbClient = db): Promise<GroupRecord | null> {
      const row = await client.queryOne<GroupRow>({
        text: 'SELECT id, name, description, created_at, updated_at FROM business_groups WHERE company_id = ? AND name = ?',
        params: [companyId, name],
      })
      return row ? toGroup(row) : null
    },

    async groupMembers(groupId: string, client: DbClient = db): Promise<BusinessGroupMember[]> {
      const rows = await client.queryAll<{ member_id: string; display_name: string }>({
        text: `SELECT m.id AS member_id, m.display_name
               FROM business_group_members bgm
               JOIN company_members m ON m.id = bgm.member_id
               WHERE bgm.group_id = ?
               ORDER BY m.display_name ASC, m.id ASC`,
        params: [groupId],
      })
      return rows.map((row) => ({ memberId: row.member_id, displayName: row.display_name }))
    },

    async insertGroup(input: { id: string; companyId: string; name: string; description: string | null; createdAt: string }, client: DbClient = db): Promise<void> {
      await client.run({
        text: 'INSERT INTO business_groups (id, company_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        params: [input.id, input.companyId, input.name, input.description, input.createdAt, input.createdAt],
      })
    },

    async updateGroup(groupId: string, input: { name: string; description: string | null; updatedAt: string }, client: DbClient = db): Promise<void> {
      await client.run({
        text: 'UPDATE business_groups SET name = ?, description = ?, updated_at = ? WHERE id = ?',
        params: [input.name, input.description, input.updatedAt, groupId],
      })
    },

    async replaceGroupMembers(groupId: string, memberIds: readonly string[], client: DbClient = db): Promise<void> {
      await client.run({ text: 'DELETE FROM business_group_members WHERE group_id = ?', params: [groupId] })
      for (const memberId of memberIds) {
        await client.run({ text: 'INSERT INTO business_group_members (group_id, member_id) VALUES (?, ?)', params: [groupId, memberId] })
      }
    },

    async groupMemberIds(groupId: string, client: DbClient = db): Promise<string[]> {
      const rows = await client.queryAll<{ member_id: string }>({ text: 'SELECT member_id FROM business_group_members WHERE group_id = ?', params: [groupId] })
      return rows.map((row) => row.member_id)
    },

    async listRules(companyId: string): Promise<AssignmentRule[]> {
      const rows = await db.queryAll<RuleRow>({
        text: `SELECT r.id, r.category, r.group_id, g.name AS group_name, r.created_at, r.updated_at
               FROM assignment_rules r
               JOIN business_groups g ON g.id = r.group_id
               WHERE r.company_id = ?
               ORDER BY r.category ASC, r.id ASC`,
        params: [companyId],
      })
      return rows.map(toRule)
    },

    async findRule(companyId: string, ruleId: string, client: DbClient = db): Promise<RuleRecord | null> {
      const row = await client.queryOne<RuleRow>({
        text: `SELECT r.id, r.category, r.group_id, g.name AS group_name, r.created_at, r.updated_at
               FROM assignment_rules r
               JOIN business_groups g ON g.id = r.group_id
               WHERE r.id = ? AND r.company_id = ?`,
        params: [ruleId, companyId],
      })
      return row ? toRule(row) : null
    },

    async findRuleByCategory(companyId: string, category: string, client: DbClient = db): Promise<RuleRecord | null> {
      const row = await client.queryOne<RuleRow>({
        text: `SELECT r.id, r.category, r.group_id, g.name AS group_name, r.created_at, r.updated_at
               FROM assignment_rules r
               JOIN business_groups g ON g.id = r.group_id
               WHERE r.company_id = ? AND r.category = ?`,
        params: [companyId, category],
      })
      return row ? toRule(row) : null
    },

    async insertRule(input: { id: string; companyId: string; category: string; groupId: string; createdAt: string }, client: DbClient = db): Promise<void> {
      await client.run({
        text: 'INSERT INTO assignment_rules (id, company_id, category, group_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        params: [input.id, input.companyId, input.category, input.groupId, input.createdAt, input.createdAt],
      })
    },

    async updateRule(ruleId: string, input: { category: string; groupId: string; updatedAt: string }, client: DbClient = db): Promise<void> {
      await client.run({
        text: 'UPDATE assignment_rules SET category = ?, group_id = ?, updated_at = ? WHERE id = ?',
        params: [input.category, input.groupId, input.updatedAt, ruleId],
      })
    },

    async deleteRule(ruleId: string, client: DbClient = db): Promise<void> {
      await client.run({ text: 'DELETE FROM assignment_rules WHERE id = ?', params: [ruleId] })
    },

    async isMemberOfGroup(groupId: string, memberId: string, client: DbClient = db): Promise<boolean> {
      const row = await client.queryOne<{ member_id: string }>({
        text: 'SELECT member_id FROM business_group_members WHERE group_id = ? AND member_id = ?',
        params: [groupId, memberId],
      })
      return row !== null
    },

    async groupIdsForMember(companyId: string, memberId: string, client: DbClient = db): Promise<string[]> {
      const rows = await client.queryAll<{ group_id: string }>({
        text: `SELECT bgm.group_id FROM business_group_members bgm
               JOIN business_groups g ON g.id = bgm.group_id
               WHERE g.company_id = ? AND bgm.member_id = ?
               ORDER BY g.name ASC, g.id ASC`,
        params: [companyId, memberId],
      })
      return rows.map((row) => row.group_id)
    },
  }
}

export type OrgRepository = ReturnType<typeof createOrgRepository>
export type { BusinessGroup, BusinessGroupMember, BusinessGroupSummary, AssignmentRule }
