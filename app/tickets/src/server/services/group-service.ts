import type { DbClient } from '@commonapp/dbkit'
import type { AuditEvent } from '@commonapp/auditkit'

const now = () => new Date().toISOString()

interface GroupRow {
  id: number
  company_id: string
  name: string
  created_at: string
}

interface MemberRow {
  group_id: number
  user_id: number
  name: string
  email: string
}

export async function createGroup(
  db: DbClient,
  auditKit: { record: (e: AuditEvent) => Promise<void> },
  companyId: string,
  name: string,
  actorId: string,
  actorName: string,
): Promise<{ id: string; companyId: string; name: string; createdAt: string }> {
  const ts = now()
  await db.run({
    text: 'INSERT INTO business_groups (company_id, name, created_at) VALUES (?, ?, ?)',
    params: [companyId, name, ts],
  })
  const row = await db.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
  const groupId = String(row?.id ?? 0)

  await auditKit.record({
    type: 'group:create',
    occurredAt: ts,
    actorUserId: actorId,
    metadata: { actorName, entityType: 'group', entityId: groupId, name },
  })

  return { id: groupId, companyId, name, createdAt: ts }
}

export async function listGroups(
  db: DbClient,
  companyId: string,
): Promise<{ id: string; name: string; members: { userId: string; userName: string; email: string }[] }[]> {
  const groups = await db.queryAll<GroupRow>({
    text: 'SELECT * FROM business_groups WHERE company_id = ? ORDER BY created_at ASC',
    params: [companyId],
  })

  const result = await Promise.all(
    groups.map(async (g) => {
      const members = await db.queryAll<MemberRow>({
        text: `SELECT m.group_id, m.user_id, u.name, u.email
               FROM business_group_members m
               JOIN users u ON m.user_id = u.id
               WHERE m.group_id = ?`,
        params: [g.id],
      })
      return {
        id: String(g.id),
        name: g.name,
        members: members.map((m) => ({
          userId: String(m.user_id),
          userName: m.name,
          email: m.email,
        })),
      }
    }),
  )

  return result
}

export async function addMember(
  db: DbClient,
  auditKit: { record: (e: AuditEvent) => Promise<void> },
  groupId: number,
  companyId: string,
  userId: number,
  actorId: string,
  actorName: string,
): Promise<{ error?: string; result?: { groupId: string; userId: string; userName: string } }> {
  // Verify group belongs to company
  const group = await db.queryOne<GroupRow>({
    text: 'SELECT * FROM business_groups WHERE id = ? AND company_id = ?',
    params: [groupId, companyId],
  })
  if (!group) return { error: 'group_or_user_not_found' }

  // Verify user exists and belongs to same company
  const user = await db.queryOne<{ id: number; name: string; company_id: string }>({
    text: 'SELECT id, name, company_id FROM users WHERE id = ?',
    params: [userId],
  })
  if (!user || user.company_id !== companyId) return { error: 'group_or_user_not_found' }

  // Check if already a member
  const existing = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM business_group_members WHERE group_id = ? AND user_id = ?',
    params: [groupId, userId],
  })
  if (existing) return { error: 'already_member' }

  const ts = now()
  await db.run({
    text: 'INSERT INTO business_group_members (group_id, user_id, created_at) VALUES (?, ?, ?)',
    params: [groupId, userId, ts],
  })
  await auditKit.record({
    type: 'group:member-add',
    occurredAt: ts,
    actorUserId: actorId,
    metadata: { actorName, entityType: 'group', entityId: String(groupId), userId: String(userId), userName: user.name },
  })

  return { result: { groupId: String(groupId), userId: String(userId), userName: user.name } }
}

export async function removeMember(
  db: DbClient,
  auditKit: { record: (e: AuditEvent) => Promise<void> },
  groupId: number,
  companyId: string,
  userId: number,
  actorId: string,
  actorName: string,
): Promise<void> {
  await db.run({
    text: 'DELETE FROM business_group_members WHERE group_id = ? AND user_id = ?',
    params: [groupId, userId],
  })
  await auditKit.record({
    type: 'group:member-remove',
    occurredAt: now(),
    actorUserId: actorId,
    metadata: { actorName, entityType: 'group', entityId: String(groupId), userId: String(userId) },
  })
}

export async function createRule(
  db: DbClient,
  auditKit: { record: (e: AuditEvent) => Promise<void> },
  companyId: string,
  category: string,
  groupId: number,
  actorId: string,
  actorName: string,
): Promise<{ error?: string; result?: { id: string; companyId: string; category: string; groupId: string; groupName: string } }> {
  // Verify group belongs to company
  const group = await db.queryOne<{ id: number; name: string }>({
    text: 'SELECT id, name FROM business_groups WHERE id = ? AND company_id = ?',
    params: [groupId, companyId],
  })
  if (!group) return { error: 'group_or_user_not_found' }

  // Check for duplicate rule
  const existing = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM auto_assignment_rules WHERE company_id = ? AND category = ?',
    params: [companyId, category],
  })
  if (existing) return { error: 'duplicate_rule' }

  const ts = now()
  await db.run({
    text: 'INSERT INTO auto_assignment_rules (company_id, category, group_id, created_at) VALUES (?, ?, ?, ?)',
    params: [companyId, category, groupId, ts],
  })
  const row = await db.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
  const ruleId = String(row?.id ?? 0)

  await auditKit.record({
    type: 'rule:create',
    occurredAt: ts,
    actorUserId: actorId,
    metadata: { actorName, entityType: 'rule', entityId: ruleId, category, groupId: String(groupId), groupName: group.name },
  })

  return {
    result: {
      id: ruleId,
      companyId,
      category,
      groupId: String(groupId),
      groupName: group.name,
    },
  }
}

export async function listRules(
  db: DbClient,
  companyId: string,
): Promise<{ id: string; category: string; groupId: string; groupName: string }[]> {
  const rows = await db.queryAll<{ id: number; category: string; group_id: number; name: string }>({
    text: `SELECT r.id, r.category, r.group_id, g.name
           FROM auto_assignment_rules r
           JOIN business_groups g ON r.group_id = g.id
           WHERE r.company_id = ?
           ORDER BY r.id ASC`,
    params: [companyId],
  })
  return rows.map((r) => ({
    id: String(r.id),
    category: r.category,
    groupId: String(r.group_id),
    groupName: r.name,
  }))
}
