import type { DbClient, SqlStatement } from '@commonapp/dbkit'

export const nowIso = () => new Date().toISOString()

export type CompanyRow = { id: number; name: string }
export type DepartmentRow = { id: number; companyId: number; name: string }
export type CategoryRow = { id: number; name: string }

export type UserProfileRow = {
  id: number
  userId: string
  displayName: string
  email: string
  companyId: number | null
  departmentId: number | null
}

/** 契约中的 profile 结构：公司、部门等业务属性 */
export type UserProfileDto = {
  id: number
  userId: string
  displayName: string
  email: string
  companyId: number | null
  departmentId: number | null
}

export type UserSummaryRow = { id: string; email: string; profile: UserProfileRow | null }
export type GroupMemberRow = { userId: string; displayName: string }
export type BusinessGroupRow = { id: number; companyId: number; name: string; members: GroupMemberRow[] }
export type AssignmentRuleRow = {
  id: number
  companyId: number
  categoryId: number
  categoryName: string
  targetGroupId: number
  targetGroupName: string
}

export const TICKET_STATUSES = ['created', 'pending_assignment', 'pending_processing', 'completed', 'cancelled'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]
export const TERMINAL_STATUSES: readonly TicketStatus[] = ['completed', 'cancelled']
export const SLA_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const

export type TicketRow = {
  id: number
  title: string
  description: string
  categoryId: number
  categoryName: string
  slaPriority: string
  companyId: number
  companyName: string
  submitterUserId: string
  submitterName: string
  submitterEmail: string
  submitterDepartment: string | null
  businessGroupId: number | null
  businessGroupName: string | null
  handlerUserId: string | null
  handlerName: string | null
  status: TicketStatus
  createdAt: string
  firstResponseAt: string | null
  completedAt: string | null
  cancelledAt: string | null
}

export type TicketListRow = {
  id: number
  title: string
  status: TicketStatus
  slaPriority: string
  categoryId: number
  categoryName: string
  companyName: string
  businessGroupId: number | null
  createdAt: string
}

export type ReplyRow = { id: number; content: string; replierUserId: string; replierName: string; createdAt: string }
export type TransferRow = {
  id: number
  fromGroupName: string | null
  toGroupName: string | null
  transferredBy: string
  transferredAt: string
}
export type RatingRow = { id: number; ticketId: number; score: number; comment: string | null; ratedAt: string }
export type TicketLogRow = {
  id: string
  action: string
  operatorName: string
  createdAt: string
  details: Record<string, unknown>
}

export type TicketListQuery = {
  companyId: number
  status?: string
  categoryId?: number
  priority?: string
  q?: string
  sort: 'createdAt' | 'slaPriority' | 'status'
  order: 'asc' | 'desc'
  page: number
  size: number
}

export type TicketInsert = {
  title: string
  description: string
  categoryId: number
  slaPriority: string
  companyId: number
  submitterUserId: string
  submitterName: string
  submitterEmail: string
  submitterDepartment: string | null
  createdAt: string
}

export type TicketPatch = {
  status?: TicketStatus
  businessGroupId?: number | null
  handlerUserId?: string | null
  handlerName?: string | null
  firstResponseAt?: string | null
  completedAt?: string | null
  cancelledAt?: string | null
}

type DbRow = Record<string, unknown>

const mapProfile = (row: DbRow): UserProfileRow => ({
  id: Number(row.id),
  userId: String(row.user_id),
  displayName: String(row.display_name),
  email: String(row.email),
  companyId: row.company_id === null || row.company_id === undefined ? null : Number(row.company_id),
  departmentId: row.department_id === null || row.department_id === undefined ? null : Number(row.department_id),
})

export const toProfileDto = (profile: UserProfileRow): UserProfileDto => ({
  id: profile.id,
  userId: profile.userId,
  displayName: profile.displayName,
  email: profile.email,
  companyId: profile.companyId,
  departmentId: profile.departmentId,
})

/**
 * 读取用户业务属性；若尚未建立，则按 users 表当前值补建一条，保证每个用户都有一条可信的业务属性记录。
 * 公司范围（公司隔离的授权依据）只取自这里，不取自请求参数。
 */
export async function loadUserProfile(db: DbClient, userId: string): Promise<UserProfileRow | null> {
  const existing = await db.queryOne<DbRow>({
    text: 'SELECT id, user_id, display_name, email, company_id, department_id FROM user_profiles WHERE user_id = ?',
    params: [userId],
  })
  if (existing) return mapProfile(existing)
  const user = await db.queryOne<DbRow>({
    text: 'SELECT id, name, email, company_id FROM users WHERE id = ?',
    params: [userId],
  })
  if (!user) return null
  await db.run({
    text: 'INSERT OR IGNORE INTO user_profiles (user_id, display_name, email, company_id, department_id, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
    params: [userId, String(user.name), String(user.email), user.company_id ?? null, nowIso()],
  })
  const created = await db.queryOne<DbRow>({
    text: 'SELECT id, user_id, display_name, email, company_id, department_id FROM user_profiles WHERE user_id = ?',
    params: [userId],
  })
  return created ? mapProfile(created) : null
}

export function createTicketRepository(db: DbClient) {
  const lastInsertId = async () =>
    Number((await db.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' }))?.id ?? 0)

  const queryOne = async <T>(statement: SqlStatement) => db.queryOne<T>(statement)
  const queryAll = async <T>(statement: SqlStatement) => db.queryAll<T>(statement)

  return {
    // ── 基础数据 ────────────────────────────────────────────────
    async listCompanies(): Promise<CompanyRow[]> {
      const rows = await queryAll<DbRow>({ text: 'SELECT id, name FROM companies ORDER BY id' })
      return rows.map((row) => ({ id: Number(row.id), name: String(row.name) }))
    },
    async findCompany(id: number): Promise<CompanyRow | null> {
      const row = await queryOne<DbRow>({ text: 'SELECT id, name FROM companies WHERE id = ?', params: [id] })
      return row ? { id: Number(row.id), name: String(row.name) } : null
    },
    async insertCompany(name: string, createdAt: string): Promise<CompanyRow> {
      await db.run({ text: 'INSERT INTO companies (name, created_at) VALUES (?, ?)', params: [name, createdAt] })
      return { id: await lastInsertId(), name }
    },
    async listDepartments(companyId: number): Promise<DepartmentRow[]> {
      const rows = await queryAll<DbRow>({
        text: 'SELECT id, company_id, name FROM departments WHERE company_id = ? ORDER BY id',
        params: [companyId],
      })
      return rows.map((row) => ({ id: Number(row.id), companyId: Number(row.company_id), name: String(row.name) }))
    },
    async findDepartment(id: number): Promise<DepartmentRow | null> {
      const row = await queryOne<DbRow>({
        text: 'SELECT id, company_id, name FROM departments WHERE id = ?',
        params: [id],
      })
      return row ? { id: Number(row.id), companyId: Number(row.company_id), name: String(row.name) } : null
    },
    async insertDepartment(companyId: number, name: string, createdAt: string): Promise<DepartmentRow> {
      await db.run({
        text: 'INSERT INTO departments (company_id, name, created_at) VALUES (?, ?, ?)',
        params: [companyId, name, createdAt],
      })
      return { id: await lastInsertId(), companyId, name }
    },
    async listCategories(): Promise<CategoryRow[]> {
      const rows = await queryAll<DbRow>({ text: 'SELECT id, name FROM categories ORDER BY id' })
      return rows.map((row) => ({ id: Number(row.id), name: String(row.name) }))
    },
    async findCategory(id: number): Promise<CategoryRow | null> {
      const row = await queryOne<DbRow>({ text: 'SELECT id, name FROM categories WHERE id = ?', params: [id] })
      return row ? { id: Number(row.id), name: String(row.name) } : null
    },
    async insertCategory(name: string, createdAt: string): Promise<CategoryRow> {
      await db.run({ text: 'INSERT INTO categories (name, created_at) VALUES (?, ?)', params: [name, createdAt] })
      return { id: await lastInsertId(), name }
    },

    // ── 用户业务属性 ────────────────────────────────────────────
    loadUserProfile: (userId: string) => loadUserProfile(db, userId),
    async listUsersWithProfiles(): Promise<UserSummaryRow[]> {
      const rows = await queryAll<DbRow>({
        text: `SELECT u.id AS user_id, u.email AS user_email,
                      p.id AS profile_id, p.display_name, p.email AS profile_email,
                      p.company_id, p.department_id
               FROM users u
               LEFT JOIN user_profiles p ON p.user_id = u.id
               ORDER BY u.name, u.id`,
      })
      return rows.map((row) => ({
        id: String(row.user_id),
        email: String(row.user_email),
        profile: row.profile_id === null || row.profile_id === undefined ? null : mapProfile({
          id: row.profile_id,
          user_id: row.user_id,
          display_name: row.display_name,
          email: row.profile_email,
          company_id: row.company_id,
          department_id: row.department_id,
        }),
      }))
    },
    async updateProfile(userId: string, values: { displayName: string; email: string; companyId: number | null; departmentId: number | null }): Promise<void> {
      await db.run({
        text: 'UPDATE user_profiles SET display_name = ?, email = ?, company_id = ?, department_id = ? WHERE user_id = ?',
        params: [values.displayName, values.email, values.companyId, values.departmentId, userId],
      })
    },
    async insertProfile(values: { userId: string; displayName: string; email: string; companyId: number | null; departmentId: number | null }, createdAt: string): Promise<void> {
      await db.run({
        text: 'INSERT INTO user_profiles (user_id, display_name, email, company_id, department_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        params: [values.userId, values.displayName, values.email, values.companyId, values.departmentId, createdAt],
      })
    },

    // ── 业务组与分配规则 ────────────────────────────────────────
    async listGroups(companyId: number): Promise<BusinessGroupRow[]> {
      const groups = await queryAll<DbRow>({
        text: 'SELECT id, company_id, name FROM business_groups WHERE company_id = ? ORDER BY id',
        params: [companyId],
      })
      const members = await queryAll<DbRow>({
        text: `SELECT m.group_id, m.user_id, COALESCE(p.display_name, u.name) AS display_name
               FROM business_group_members m
               JOIN business_groups g ON g.id = m.group_id
               JOIN users u ON u.id = m.user_id
               LEFT JOIN user_profiles p ON p.user_id = m.user_id
               WHERE g.company_id = ?
               ORDER BY m.group_id, display_name, m.user_id`,
        params: [companyId],
      })
      return groups.map((group) => ({
        id: Number(group.id),
        companyId: Number(group.company_id),
        name: String(group.name),
        members: members
          .filter((member) => Number(member.group_id) === Number(group.id))
          .map((member) => ({ userId: String(member.user_id), displayName: String(member.display_name) })),
      }))
    },
    async findGroup(id: number): Promise<BusinessGroupRow | null> {
      const row = await queryOne<DbRow>({
        text: 'SELECT id, company_id, name FROM business_groups WHERE id = ?',
        params: [id],
      })
      return row ? { id: Number(row.id), companyId: Number(row.company_id), name: String(row.name), members: [] } : null
    },
    async insertGroup(companyId: number, name: string, createdAt: string): Promise<BusinessGroupRow> {
      await db.run({
        text: 'INSERT INTO business_groups (company_id, name, created_at) VALUES (?, ?, ?)',
        params: [companyId, name, createdAt],
      })
      return { id: await lastInsertId(), companyId, name, members: [] }
    },
    async isMember(groupId: number, userId: string): Promise<boolean> {
      const row = await queryOne<DbRow>({
        text: 'SELECT 1 AS present FROM business_group_members WHERE group_id = ? AND user_id = ?',
        params: [groupId, userId],
      })
      return Boolean(row)
    },
    async insertMember(groupId: number, userId: string, createdAt: string): Promise<void> {
      await db.run({
        text: 'INSERT INTO business_group_members (group_id, user_id, created_at) VALUES (?, ?, ?)',
        params: [groupId, userId, createdAt],
      })
    },
    async deleteMember(groupId: number, userId: string): Promise<number> {
      const result = await db.run({
        text: 'DELETE FROM business_group_members WHERE group_id = ? AND user_id = ?',
        params: [groupId, userId],
      })
      return result.changes
    },
    async listRules(companyId: number): Promise<AssignmentRuleRow[]> {
      const rows = await queryAll<DbRow>({
        text: `SELECT r.id, r.company_id, r.category_id, c.name AS category_name,
                      r.target_group_id, g.name AS target_group_name
               FROM assignment_rules r
               JOIN categories c ON c.id = r.category_id
               JOIN business_groups g ON g.id = r.target_group_id
               WHERE r.company_id = ?
               ORDER BY r.id`,
        params: [companyId],
      })
      return rows.map((row) => ({
        id: Number(row.id),
        companyId: Number(row.company_id),
        categoryId: Number(row.category_id),
        categoryName: String(row.category_name),
        targetGroupId: Number(row.target_group_id),
        targetGroupName: String(row.target_group_name),
      }))
    },
    async findRule(companyId: number, categoryId: number): Promise<AssignmentRuleRow | null> {
      const rows = await this.listRules(companyId)
      return rows.find((rule) => rule.categoryId === categoryId) ?? null
    },
    async upsertRule(companyId: number, categoryId: number, targetGroupId: number, createdAt: string): Promise<AssignmentRuleRow> {
      await db.run({
        text: `INSERT INTO assignment_rules (company_id, category_id, target_group_id, created_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT (company_id, category_id) DO UPDATE SET target_group_id = excluded.target_group_id`,
        params: [companyId, categoryId, targetGroupId, createdAt],
      })
      const rule = await this.findRule(companyId, categoryId)
      if (!rule) throw new Error('Assignment rule write did not persist')
      return rule
    },

    // ── 工单 ───────────────────────────────────────────────────
    async insertTicket(values: TicketInsert): Promise<number> {
      await db.run({
        text: `INSERT INTO tickets
                 (title, description, category_id, sla_priority, company_id, submitter_user_id,
                  submitter_name, submitter_email, submitter_department, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', ?)`,
        params: [
          values.title,
          values.description,
          values.categoryId,
          values.slaPriority,
          values.companyId,
          values.submitterUserId,
          values.submitterName,
          values.submitterEmail,
          values.submitterDepartment,
          values.createdAt,
        ],
      })
      return lastInsertId()
    },
    async updateTicket(id: number, patch: TicketPatch): Promise<void> {
      const columns: Record<keyof TicketPatch, string> = {
        status: 'status',
        businessGroupId: 'business_group_id',
        handlerUserId: 'handler_user_id',
        handlerName: 'handler_name',
        firstResponseAt: 'first_response_at',
        completedAt: 'completed_at',
        cancelledAt: 'cancelled_at',
      }
      const fields: string[] = []
      const params: unknown[] = []
      for (const [key, column] of Object.entries(columns) as Array<[keyof TicketPatch, string]>) {
        if (patch[key] === undefined) continue
        fields.push(`${column} = ?`)
        params.push(patch[key])
      }
      if (!fields.length) return
      params.push(id)
      await db.run({ text: `UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`, params })
    },
    async findTicket(id: number): Promise<TicketRow | null> {
      const row = await queryOne<DbRow>({ text: `${TICKET_SELECT} WHERE t.id = ?`, params: [id] })
      return row ? mapTicket(row) : null
    },
    async listTickets(query: TicketListQuery): Promise<{ items: TicketListRow[]; total: number }> {
      const where: string[] = ['t.company_id = ?']
      const params: unknown[] = [query.companyId]
      if (query.status) {
        where.push('t.status = ?')
        params.push(query.status)
      }
      if (query.categoryId !== undefined) {
        where.push('t.category_id = ?')
        params.push(query.categoryId)
      }
      if (query.priority) {
        where.push('t.sla_priority = ?')
        params.push(query.priority)
      }
      if (query.q) {
        where.push('(t.title LIKE ? OR t.description LIKE ?)')
        const pattern = `%${query.q}%`
        params.push(pattern, pattern)
      }
      const clause = `FROM tickets t JOIN categories c ON c.id = t.category_id JOIN companies co ON co.id = t.company_id WHERE ${where.join(' AND ')}`
      const total = Number((await queryOne<DbRow>({ text: `SELECT COUNT(*) AS total ${clause}`, params }))?.total ?? 0)
      const sortColumn = { createdAt: 't.created_at', slaPriority: 't.sla_priority', status: 't.status' }[query.sort]
      const direction = query.order === 'asc' ? 'ASC' : 'DESC'
      const rows = await queryAll<DbRow>({
        text: `SELECT t.id, t.title, t.status, t.sla_priority, t.category_id, c.name AS category_name,
                      co.name AS company_name, t.business_group_id, t.created_at
               ${clause}
               ORDER BY ${sortColumn} ${direction}, t.id ${direction}
               LIMIT ? OFFSET ?`,
        params: [...params, query.size, (query.page - 1) * query.size],
      })
      return {
        items: rows.map((row) => ({
          id: Number(row.id),
          title: String(row.title),
          status: row.status as TicketStatus,
          slaPriority: String(row.sla_priority),
          categoryId: Number(row.category_id),
          categoryName: String(row.category_name),
          companyName: String(row.company_name),
          businessGroupId: row.business_group_id === null || row.business_group_id === undefined ? null : Number(row.business_group_id),
          createdAt: String(row.created_at),
        })),
        total,
      }
    },
    async listSubmitterTickets(companyId: number, submitterUserId: string): Promise<TicketListRow[]> {
      const rows = await queryAll<DbRow>({
        text: `SELECT t.id, t.title, t.status, t.sla_priority, t.category_id, c.name AS category_name,
                      co.name AS company_name, t.business_group_id, t.created_at
               FROM tickets t
               JOIN categories c ON c.id = t.category_id
               JOIN companies co ON co.id = t.company_id
               WHERE t.company_id = ? AND t.submitter_user_id = ?
               ORDER BY t.created_at DESC, t.id DESC`,
        params: [companyId, submitterUserId],
      })
      return rows.map((row) => ({
        id: Number(row.id),
        title: String(row.title),
        status: row.status as TicketStatus,
        slaPriority: String(row.sla_priority),
        categoryId: Number(row.category_id),
        categoryName: String(row.category_name),
        companyName: String(row.company_name),
        businessGroupId: row.business_group_id === null || row.business_group_id === undefined ? null : Number(row.business_group_id),
        createdAt: String(row.created_at),
      }))
    },

    // ── 回复 / 转派 / 评价 ──────────────────────────────────────
    async insertReply(ticketId: number, content: string, replierUserId: string, replierName: string, createdAt: string): Promise<ReplyRow> {
      await db.run({
        text: 'INSERT INTO ticket_replies (ticket_id, content, replier_user_id, replier_name, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [ticketId, content, replierUserId, replierName, createdAt],
      })
      return { id: await lastInsertId(), content, replierUserId, replierName, createdAt }
    },
    async listReplies(ticketId: number): Promise<ReplyRow[]> {
      const rows = await queryAll<DbRow>({
        text: 'SELECT id, content, replier_user_id, replier_name, created_at FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at, id',
        params: [ticketId],
      })
      return rows.map((row) => ({
        id: Number(row.id),
        content: String(row.content),
        replierUserId: String(row.replier_user_id),
        replierName: String(row.replier_name),
        createdAt: String(row.created_at),
      }))
    },
    async insertTransfer(values: {
      ticketId: number
      fromGroupId: number | null
      toGroupId: number | null
      fromUserId: string | null
      toUserId: string | null
      transferredBy: string
      transferredAt: string
    }): Promise<TransferRow> {
      await db.run({
        text: `INSERT INTO ticket_transfers (ticket_id, from_group_id, to_group_id, from_user_id, to_user_id, transferred_by, transferred_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params: [
          values.ticketId,
          values.fromGroupId,
          values.toGroupId,
          values.fromUserId,
          values.toUserId,
          values.transferredBy,
          values.transferredAt,
        ],
      })
      const id = await lastInsertId()
      const names = await queryAll<DbRow>({
        text: 'SELECT id, name FROM business_groups WHERE id IN (?, ?)',
        params: [values.fromGroupId ?? -1, values.toGroupId ?? -1],
      })
      const nameOf = (groupId: number | null) =>
        groupId === null ? null : String(names.find((row) => Number(row.id) === groupId)?.name ?? '') || null
      return {
        id,
        fromGroupName: nameOf(values.fromGroupId),
        toGroupName: nameOf(values.toGroupId),
        transferredBy: values.transferredBy,
        transferredAt: values.transferredAt,
      }
    },
    async listTransfers(ticketId: number): Promise<TransferRow[]> {
      const rows = await queryAll<DbRow>({
        text: `SELECT tr.id, tr.transferred_by, tr.transferred_at,
                      fg.name AS from_group_name, tg.name AS to_group_name
               FROM ticket_transfers tr
               LEFT JOIN business_groups fg ON fg.id = tr.from_group_id
               LEFT JOIN business_groups tg ON tg.id = tr.to_group_id
               WHERE tr.ticket_id = ?
               ORDER BY tr.transferred_at, tr.id`,
        params: [ticketId],
      })
      return rows.map((row) => ({
        id: Number(row.id),
        fromGroupName: row.from_group_name === null || row.from_group_name === undefined ? null : String(row.from_group_name),
        toGroupName: row.to_group_name === null || row.to_group_name === undefined ? null : String(row.to_group_name),
        transferredBy: String(row.transferred_by),
        transferredAt: String(row.transferred_at),
      }))
    },
    async insertRating(ticketId: number, score: number, comment: string | null, ratedBy: string, ratedAt: string): Promise<RatingRow> {
      await db.run({
        text: 'INSERT INTO ticket_ratings (ticket_id, score, comment, rated_by, rated_at) VALUES (?, ?, ?, ?, ?)',
        params: [ticketId, score, comment, ratedBy, ratedAt],
      })
      return { id: await lastInsertId(), ticketId, score, comment, ratedAt }
    },
    async findRating(ticketId: number): Promise<RatingRow | null> {
      const row = await queryOne<DbRow>({
        text: 'SELECT id, ticket_id, score, comment, rated_at FROM ticket_ratings WHERE ticket_id = ?',
        params: [ticketId],
      })
      if (!row) return null
      return {
        id: Number(row.id),
        ticketId: Number(row.ticket_id),
        score: Number(row.score),
        comment: row.comment === null || row.comment === undefined ? null : String(row.comment),
        ratedAt: String(row.rated_at),
      }
    },

    // ── 审计日志读取（按工单标识，写入走 auditkit） ────────────
    async listTicketLogs(ticketId: number): Promise<TicketLogRow[]> {
      const rows = await queryAll<DbRow>({
        text: `SELECT id, event_type, occurred_at, metadata_json
               FROM audit_events
               WHERE json_extract(metadata_json, '$.ticketId') = ?
               ORDER BY occurred_at, rowid`,
        params: [ticketId],
      })
      return rows.map((row) => {
        let metadata: Record<string, unknown> = {}
        try {
          const parsed: unknown = JSON.parse(String(row.metadata_json ?? '{}'))
          if (parsed && typeof parsed === 'object') metadata = parsed as Record<string, unknown>
        } catch {
          metadata = {}
        }
        return {
          id: String(row.id),
          action: String(row.event_type).replace(/^ticket\./, ''),
          operatorName: typeof metadata.operatorName === 'string' ? metadata.operatorName : '',
          createdAt: String(row.occurred_at),
          details: metadata,
        }
      })
    },

    // ── 统计 ───────────────────────────────────────────────────
    async countTickets(companyId: number): Promise<number> {
      return Number((await queryOne<DbRow>({ text: 'SELECT COUNT(*) AS total FROM tickets WHERE company_id = ?', params: [companyId] }))?.total ?? 0)
    },
    async listResponsePairs(companyId: number): Promise<Array<{ createdAt: string; firstResponseAt: string }>> {
      const rows = await queryAll<DbRow>({
        text: 'SELECT created_at, first_response_at FROM tickets WHERE company_id = ? AND first_response_at IS NOT NULL',
        params: [companyId],
      })
      return rows.map((row) => ({ createdAt: String(row.created_at), firstResponseAt: String(row.first_response_at) }))
    },
    async averageRating(companyId: number): Promise<number | null> {
      const row = await queryOne<DbRow>({
        text: `SELECT AVG(r.score) AS score
               FROM ticket_ratings r JOIN tickets t ON t.id = r.ticket_id
               WHERE t.company_id = ?`,
        params: [companyId],
      })
      return row?.score === null || row?.score === undefined ? null : Number(row.score)
    },
    async hotCategories(companyId: number): Promise<Array<{ categoryId: number; categoryName: string; count: number }>> {
      const rows = await queryAll<DbRow>({
        text: `SELECT c.id AS category_id, c.name AS category_name, COUNT(*) AS total
               FROM tickets t JOIN categories c ON c.id = t.category_id
               WHERE t.company_id = ?
               GROUP BY c.id, c.name
               ORDER BY total DESC, c.name ASC`,
        params: [companyId],
      })
      return rows.map((row) => ({
        categoryId: Number(row.category_id),
        categoryName: String(row.category_name),
        count: Number(row.total),
      }))
    },
    async departmentDistribution(companyId: number): Promise<Array<{ label: string; count: number }>> {
      const rows = await queryAll<DbRow>({
        text: `SELECT COALESCE(NULLIF(TRIM(t.submitter_department), ''), '未指定部门') AS label, COUNT(*) AS total
               FROM tickets t
               WHERE t.company_id = ?
               GROUP BY label
               ORDER BY total DESC, label ASC`,
        params: [companyId],
      })
      return rows.map((row) => ({ label: String(row.label), count: Number(row.total) }))
    },
  }
}

const TICKET_SELECT = `SELECT t.id, t.title, t.description, t.category_id, c.name AS category_name, t.sla_priority,
                              t.company_id, co.name AS company_name, t.submitter_user_id, t.submitter_name,
                              t.submitter_email, t.submitter_department, t.business_group_id, g.name AS business_group_name,
                              t.handler_user_id, t.handler_name, t.status, t.created_at, t.first_response_at,
                              t.completed_at, t.cancelled_at
                       FROM tickets t
                       JOIN categories c ON c.id = t.category_id
                       JOIN companies co ON co.id = t.company_id
                       LEFT JOIN business_groups g ON g.id = t.business_group_id`

const mapTicket = (row: DbRow): TicketRow => ({
  id: Number(row.id),
  title: String(row.title),
  description: String(row.description),
  categoryId: Number(row.category_id),
  categoryName: String(row.category_name),
  slaPriority: String(row.sla_priority),
  companyId: Number(row.company_id),
  companyName: String(row.company_name),
  submitterUserId: String(row.submitter_user_id),
  submitterName: String(row.submitter_name),
  submitterEmail: String(row.submitter_email),
  submitterDepartment: row.submitter_department === null || row.submitter_department === undefined ? null : String(row.submitter_department),
  businessGroupId: row.business_group_id === null || row.business_group_id === undefined ? null : Number(row.business_group_id),
  businessGroupName: row.business_group_name === null || row.business_group_name === undefined ? null : String(row.business_group_name),
  handlerUserId: row.handler_user_id === null || row.handler_user_id === undefined ? null : String(row.handler_user_id),
  handlerName: row.handler_name === null || row.handler_name === undefined ? null : String(row.handler_name),
  status: row.status as TicketStatus,
  createdAt: String(row.created_at),
  firstResponseAt: row.first_response_at === null || row.first_response_at === undefined ? null : String(row.first_response_at),
  completedAt: row.completed_at === null || row.completed_at === undefined ? null : String(row.completed_at),
  cancelledAt: row.cancelled_at === null || row.cancelled_at === undefined ? null : String(row.cancelled_at),
})

export type TicketRepository = ReturnType<typeof createTicketRepository>
