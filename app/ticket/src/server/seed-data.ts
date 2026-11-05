import { createOrgService } from './services/org'
import type { initializePlatform } from './platform/bootstrap'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

export const DEMO_PASSWORD = 'TicketDemo#2026'

export const DEMO_COMPANIES = {
  acme: { id: 'seed-company-acme', code: 'ACME', name: '云启科技有限公司' },
  globex: { id: 'seed-company-globex', code: 'GLOBEX', name: '环宇贸易有限公司' },
} as const

type AccountKey =
  | 'acmeAdmin'
  | 'acmeFinance'
  | 'acmeTech'
  | 'acmeUser'
  | 'acmeFailUser'
  | 'acmeStats'
  | 'globexAdmin'
  | 'globexAgent'
  | 'globexUser'

type AccountDefinition = {
  key: AccountKey
  name: string
  email: string
  company: 'acme' | 'globex'
  department: string
  role: 'company_admin' | 'agent' | 'submitter' | 'platform_stats'
  groups?: string[]
}

const ACCOUNTS: AccountDefinition[] = [
  { key: 'acmeAdmin', name: '张敏', email: 'admin.acme@example.test', company: 'acme', department: '管理部', role: 'company_admin' },
  { key: 'acmeFinance', name: '李强', email: 'finance.acme@example.test', company: 'acme', department: '财务部', role: 'agent', groups: ['财务支持组'] },
  { key: 'acmeTech', name: '王芳', email: 'tech.acme@example.test', company: 'acme', department: '技术部', role: 'agent', groups: ['技术支持组'] },
  { key: 'acmeUser', name: '陈晨', email: 'user.acme@example.test', company: 'acme', department: '市场部', role: 'submitter' },
  { key: 'acmeFailUser', name: '刘洋', email: 'fail@acme.example.test', company: 'acme', department: '市场部', role: 'submitter' },
  { key: 'acmeStats', name: '吴静', email: 'stats@acme.example.test', company: 'acme', department: '管理部', role: 'platform_stats' },
  { key: 'globexAdmin', name: '赵磊', email: 'admin.globex@example.test', company: 'globex', department: '管理部', role: 'company_admin' },
  { key: 'globexAgent', name: '孙悦', email: 'agent.globex@example.test', company: 'globex', department: '客服部', role: 'agent', groups: ['客户服务组'] },
  { key: 'globexUser', name: '周杰', email: 'user.globex@example.test', company: 'globex', department: '销售部', role: 'submitter' },
]

const GROUPS = {
  acme: [
    { name: '财务支持组', description: '负责账务、发票与报销问题' },
    { name: '技术支持组', description: '负责系统故障与账号问题' },
  ],
  globex: [{ name: '客户服务组', description: '负责售后与客户咨询' }],
}

const CATEGORIES = {
  acme: [
    { name: '账务问题', sortOrder: 1 },
    { name: '技术故障', sortOrder: 2 },
    { name: '产品咨询', sortOrder: 3 },
  ],
  globex: [
    { name: '售后服务', sortOrder: 1 },
    { name: '物流问题', sortOrder: 2 },
  ],
}

const RULES = {
  acme: [
    { category: '账务问题', group: '财务支持组' },
    { category: '技术故障', group: '技术支持组' },
  ],
  globex: [{ category: '售后服务', group: '客户服务组' }],
}

type SeedTicket = {
  id: string
  code: string
  company: 'acme' | 'globex'
  subject: string
  description: string
  category: string
  priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
  status: 'pending_assignment' | 'pending' | 'completed' | 'cancelled'
  submitter: AccountKey
  group?: string
  assignee?: AccountKey
  createdOffsetMinutes: number
  firstReplyOffsetMinutes?: number
  completedOffsetMinutes?: number
  completedBy?: AccountKey
  cancelledOffsetMinutes?: number
  cancelledBy?: AccountKey
  replies?: Array<{ id: string; author: AccountKey; content: string; offsetMinutes: number }>
  rating?: { id: string; score: number; comment: string; offsetMinutes: number }
  notification?: { id: string; status: 'sent' | 'failed' | 'skipped'; errorMessage: string | null; offsetMinutes: number }
  note?: string
}

const SEED_TICKETS: SeedTicket[] = [
  {
    id: 'seed-ticket-acme-1',
    code: 'TK-900001',
    company: 'acme',
    subject: '报销单审批进度咨询',
    description: '上周提交的差旅报销单仍未审批，请协助确认当前进度。',
    category: '账务问题',
    priority: 'P2',
    status: 'pending',
    submitter: 'acmeUser',
    group: '财务支持组',
    createdOffsetMinutes: -360,
    firstReplyOffsetMinutes: -330,
    replies: [{ id: 'seed-reply-acme-1', author: 'acmeFinance', content: '您好，报销单已进入财务复核，预计今天下班前完成审批。', offsetMinutes: -330 }],
  },
  {
    id: 'seed-ticket-acme-2',
    code: 'TK-900002',
    company: 'acme',
    subject: '无法登录财务系统',
    description: '输入正确密码后仍提示账号被锁定，影响月末结账。',
    category: '技术故障',
    priority: 'P1',
    status: 'completed',
    submitter: 'acmeUser',
    group: '技术支持组',
    assignee: 'acmeTech',
    createdOffsetMinutes: -1560,
    firstReplyOffsetMinutes: -1530,
    completedOffsetMinutes: -1440,
    completedBy: 'acmeTech',
    replies: [{ id: 'seed-reply-acme-2', author: 'acmeTech', content: '已重置账号锁定状态并验证可以登录，请再试一次。', offsetMinutes: -1530 }],
    rating: { id: 'seed-rating-acme-2', score: 5, comment: '响应及时，问题已解决。', offsetMinutes: -1380 },
    notification: { id: 'seed-notification-acme-2', status: 'skipped', errorMessage: null, offsetMinutes: -1435 },
    note: '账号锁定已解除',
  },
  {
    id: 'seed-ticket-acme-3',
    code: 'TK-900003',
    company: 'acme',
    subject: '希望了解新版本功能',
    description: '想了解新版本是否支持批量导出工单报表。',
    category: '产品咨询',
    priority: 'P3',
    status: 'pending_assignment',
    submitter: 'acmeUser',
    createdOffsetMinutes: -180,
  },
  {
    id: 'seed-ticket-acme-4',
    code: 'TK-900004',
    company: 'acme',
    subject: '打印机连接失败',
    description: '办公区打印机无法连接，尝试重启后仍未恢复。',
    category: '技术故障',
    priority: 'P2',
    status: 'cancelled',
    submitter: 'acmeUser',
    createdOffsetMinutes: -480,
    cancelledOffsetMinutes: -420,
    cancelledBy: 'acmeUser',
    note: '已自行恢复，无需处理',
  },
  {
    id: 'seed-ticket-acme-5',
    code: 'TK-900005',
    company: 'acme',
    subject: '发票抬头修改',
    description: '上月发票抬头需要更改为新的公司全称，请协助处理。',
    category: '账务问题',
    priority: 'P2',
    status: 'completed',
    submitter: 'acmeFailUser',
    group: '财务支持组',
    assignee: 'acmeFinance',
    createdOffsetMinutes: -3000,
    firstReplyOffsetMinutes: -2940,
    completedOffsetMinutes: -2880,
    completedBy: 'acmeFinance',
    replies: [{ id: 'seed-reply-acme-5', author: 'acmeFinance', content: '已收到抬头修改申请，正在重新开具发票。', offsetMinutes: -2940 }],
    rating: { id: 'seed-rating-acme-5', score: 4, comment: '处理完成，沟通可以更及时。', offsetMinutes: -2820 },
    notification: { id: 'seed-notification-acme-5', status: 'failed', errorMessage: 'SMTP delivery failed', offsetMinutes: -2875 },
    note: '发票已重新开具',
  },
  {
    id: 'seed-ticket-globex-1',
    code: 'TK-900006',
    company: 'globex',
    subject: '售后维修预约',
    description: '购买的设备出现异响，希望预约上门检修。',
    category: '售后服务',
    priority: 'P2',
    status: 'pending',
    submitter: 'globexUser',
    group: '客户服务组',
    createdOffsetMinutes: -120,
  },
  {
    id: 'seed-ticket-globex-2',
    code: 'TK-900007',
    company: 'globex',
    subject: '物流进度查询',
    description: '订单显示已发货，但物流信息三天未更新。',
    category: '物流问题',
    priority: 'P3',
    status: 'pending_assignment',
    submitter: 'globexUser',
    createdOffsetMinutes: -60,
  },
  {
    id: 'seed-ticket-globex-3',
    code: 'TK-900008',
    company: 'globex',
    subject: '退换货流程咨询',
    description: '想确认七天无理由退换货需要准备哪些材料。',
    category: '售后服务',
    priority: 'P2',
    status: 'completed',
    submitter: 'globexUser',
    group: '客户服务组',
    assignee: 'globexAgent',
    createdOffsetMinutes: -1800,
    firstReplyOffsetMinutes: -1740,
    completedOffsetMinutes: -1680,
    completedBy: 'globexAgent',
    replies: [{ id: 'seed-reply-globex-3', author: 'globexAgent', content: '请保留原包装与购买凭证，我们已为您登记退换货申请。', offsetMinutes: -1740 }],
    rating: { id: 'seed-rating-globex-3', score: 5, comment: '流程说明清楚。', offsetMinutes: -1620 },
    notification: { id: 'seed-notification-globex-3', status: 'skipped', errorMessage: null, offsetMinutes: -1675 },
    note: '退换货申请已登记',
  },
]

export type SeedAccount = { id: string; name: string; email: string; companyId: string; department: string; role: AccountDefinition['role'] }
export type SeedResult = {
  companies: Record<'acme' | 'globex', { id: string; code: string; name: string }>
  accounts: Record<AccountKey, SeedAccount>
  groups: Record<string, string>
  categories: Record<string, string>
}

const roleScope = (role: AccountDefinition['role'], companyId: string) =>
  role === 'platform_stats' ? {} : { type: 'company', id: companyId }

export async function seedDemoData(platform: Platform): Promise<SeedResult> {
  const { db, auth, permissions } = platform
  const org = createOrgService(db)
  const now = Date.now()
  const iso = (offsetMinutes: number) => new Date(now + offsetMinutes * 60 * 1000).toISOString()
  const createdAt = new Date(now).toISOString()

  const companies = Object.fromEntries(
    await Promise.all(
      Object.entries(DEMO_COMPANIES).map(async ([key, company]) => {
        await db.run({
          text: `INSERT INTO companies (id, code, name, created_at) VALUES (?, ?, ?, ?)
                 ON CONFLICT(code) DO UPDATE SET name = excluded.name`,
          params: [company.id, company.code, company.name, createdAt],
        })
        const row = await db.queryOne<{ id: string; code: string; name: string }>({
          text: 'SELECT id, code, name FROM companies WHERE code = ?',
          params: [company.code],
        })
        if (!row) throw new Error(`Seed company ${company.code} was not persisted`)
        return [key, row]
      }),
    ),
  ) as SeedResult['companies']

  const accounts = {} as Record<AccountKey, SeedAccount>
  for (const definition of ACCOUNTS) {
    const company = companies[definition.company]
    const existing = await auth.userStore.findByField('email', definition.email)
    let userId: string
    if (!existing) {
      const created = await auth.userStore.create(
        {
          name: definition.name,
          email: definition.email,
          companyId: company.id,
          passwordChangeRequired: false,
        },
        auth.hashPassword(DEMO_PASSWORD),
      )
      userId = created.id
    } else {
      userId = existing.id
      await auth.userStore.update(userId, { name: definition.name, email: definition.email, phone: null, companyId: company.id })
      await auth.userStore.updatePassword(userId, auth.hashPassword(DEMO_PASSWORD), false)
    }
    await db.run({
      text: `INSERT INTO user_profiles (user_id, company_id, department, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET company_id = excluded.company_id, department = excluded.department, updated_at = excluded.updated_at`,
      params: [userId, company.id, definition.department, createdAt, createdAt],
    })
    const role = definition.role === 'submitter' ? null : definition.role
    if (role) {
      const scope = roleScope(role, company.id)
      await permissions.assignRole(userId, role, scope)
    }
    accounts[definition.key] = {
      id: userId,
      name: definition.name,
      email: definition.email,
      companyId: company.id,
      department: definition.department,
      role: definition.role,
    }
  }

  const groups: Record<string, string> = {}
  for (const [companyKey, definitions] of Object.entries(GROUPS)) {
    const company = companies[companyKey as 'acme' | 'globex']
    const existingGroups = await org.listGroups(company.id)
    for (const definition of definitions) {
      const existing = existingGroups.find((group) => group.name === definition.name)
      const group = existing
        ? await org.updateGroup(company.id, existing.id, { description: definition.description, enabled: true })
        : await org.createGroup(company.id, definition)
      groups[`${companyKey}:${definition.name}`] = group.id
    }
  }

  const categories: Record<string, string> = {}
  for (const [companyKey, definitions] of Object.entries(CATEGORIES)) {
    const company = companies[companyKey as 'acme' | 'globex']
    const existingCategories = await org.listCategories(company.id)
    for (const definition of definitions) {
      const existing = existingCategories.find((category) => category.name === definition.name)
      const category = existing
        ? await org.updateCategory(company.id, existing.id, { enabled: true, sortOrder: definition.sortOrder })
        : await org.createCategory(company.id, definition)
      categories[`${companyKey}:${definition.name}`] = category.id
    }
  }

  for (const definition of ACCOUNTS) {
    const company = companies[definition.company]
    for (const groupName of definition.groups ?? []) {
      const groupId = groups[`${definition.company}:${groupName}`]
      if (!groupId) continue
      if (!(await org.isGroupMember(company.id, groupId, accounts[definition.key].id))) {
        await org.addGroupMember(company.id, groupId, accounts[definition.key].id)
      }
    }
  }

  for (const [companyKey, definitions] of Object.entries(RULES)) {
    const company = companies[companyKey as 'acme' | 'globex']
    for (const definition of definitions) {
      const categoryId = categories[`${companyKey}:${definition.category}`]
      const groupId = groups[`${companyKey}:${definition.group}`]
      if (!categoryId || !groupId) continue
      await org.upsertRule(company.id, { categoryId, groupId, enabled: true })
    }
  }

  for (const ticket of SEED_TICKETS) {
    await insertSeedTicket(platform, ticket, companies[ticket.company], accounts, groups, categories, iso)
  }
  await db.run({
    text: `UPDATE counters SET value = CASE WHEN value < 900010 THEN 900010 ELSE value END WHERE name = 'ticket_code'`,
  })

  return { companies, accounts, groups, categories }
}

async function insertSeedTicket(
  platform: Platform,
  ticket: SeedTicket,
  company: { id: string; code: string; name: string },
  accounts: Record<AccountKey, SeedAccount>,
  groups: Record<string, string>,
  categories: Record<string, string>,
  iso: (offsetMinutes: number) => string,
) {
  const { db } = platform
  const categoryId = categories[`${ticket.company}:${ticket.category}`]
  const groupId = ticket.group ? groups[`${ticket.company}:${ticket.group}`] : null
  if (!categoryId) throw new Error(`Seed category ${ticket.category} is missing`)
  const submitter = accounts[ticket.submitter]
  const completedBy = ticket.completedBy ? accounts[ticket.completedBy].id : null
  const cancelledBy = ticket.cancelledBy ? accounts[ticket.cancelledBy].id : null
  const assignee = ticket.assignee ? accounts[ticket.assignee].id : null
  const createdAt = iso(ticket.createdOffsetMinutes)
  const updatedAt = iso(ticket.completedOffsetMinutes ?? ticket.cancelledOffsetMinutes ?? ticket.firstReplyOffsetMinutes ?? ticket.createdOffsetMinutes)

  await db.run({
    text: `INSERT OR IGNORE INTO tickets
             (id, code, company_id, subject, description, category_id, priority, status, submitter_id, group_id, assignee_id,
              first_reply_at, completed_by, completed_at, cancelled_by, cancelled_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      ticket.id,
      ticket.code,
      company.id,
      ticket.subject,
      ticket.description,
      categoryId,
      ticket.priority,
      ticket.status,
      submitter.id,
      groupId,
      assignee,
      ticket.firstReplyOffsetMinutes === undefined ? null : iso(ticket.firstReplyOffsetMinutes),
      completedBy,
      ticket.completedOffsetMinutes === undefined ? null : iso(ticket.completedOffsetMinutes),
      cancelledBy,
      ticket.cancelledOffsetMinutes === undefined ? null : iso(ticket.cancelledOffsetMinutes),
      createdAt,
      updatedAt,
    ],
  })

  const log = async (id: string, actor: AccountKey, action: string, summary: string, detail: Record<string, unknown>, offsetMinutes: number) => {
    await db.run({
      text: `INSERT OR IGNORE INTO ticket_logs (id, ticket_id, company_id, actor_id, action, summary, detail_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [id, ticket.id, company.id, accounts[actor].id, action, summary, JSON.stringify(detail), iso(offsetMinutes)],
    })
  }

  await log(
    `${ticket.id}-log-created`,
    ticket.submitter,
    'created',
    `提交工单 ${ticket.code}`,
    { code: ticket.code, status: ticket.status, categoryId, groupId, priority: ticket.priority },
    ticket.createdOffsetMinutes,
  )
  for (const reply of ticket.replies ?? []) {
    await db.run({
      text: `INSERT OR IGNORE INTO ticket_replies (id, ticket_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)`,
      params: [reply.id, ticket.id, accounts[reply.author].id, reply.content, iso(reply.offsetMinutes)],
    })
    await log(`${reply.id}-log`, reply.author, 'replied', '回复工单', { status: ticket.status, firstReply: reply.id === ticket.replies?.[0]?.id }, reply.offsetMinutes)
  }
  if (ticket.completedOffsetMinutes !== undefined && ticket.completedBy) {
    await log(
      `${ticket.id}-log-completed`,
      ticket.completedBy,
      'completed',
      `完成工单${ticket.note ? `：${ticket.note}` : ''}`,
      { fromStatus: 'pending', toStatus: 'completed', completedAt: iso(ticket.completedOffsetMinutes), note: ticket.note ?? null },
      ticket.completedOffsetMinutes,
    )
  }
  if (ticket.cancelledOffsetMinutes !== undefined && ticket.cancelledBy) {
    await log(
      `${ticket.id}-log-cancelled`,
      ticket.cancelledBy,
      'cancelled',
      `取消工单${ticket.note ? `：${ticket.note}` : ''}`,
      { fromStatus: 'pending_assignment', toStatus: 'cancelled', cancelledAt: iso(ticket.cancelledOffsetMinutes), reason: ticket.note ?? null },
      ticket.cancelledOffsetMinutes,
    )
  }
  if (ticket.rating) {
    await db.run({
      text: `INSERT OR IGNORE INTO ticket_ratings (id, ticket_id, company_id, submitter_id, score, comment, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [ticket.rating.id, ticket.id, company.id, submitter.id, ticket.rating.score, ticket.rating.comment, iso(ticket.rating.offsetMinutes)],
    })
    await log(
      `${ticket.rating.id}-log`,
      ticket.submitter,
      'rated',
      `提交满意度评价（${ticket.rating.score} 分）`,
      { score: ticket.rating.score, comment: ticket.rating.comment },
      ticket.rating.offsetMinutes,
    )
  }
  if (ticket.notification) {
    const notification = ticket.notification
    const subject = `[${ticket.code}] 工单已完成：${ticket.subject}`
    await db.run({
      text: `INSERT OR IGNORE INTO ticket_notifications
               (id, ticket_id, company_id, recipient_email, subject, status, error_message, attempt, created_at, sent_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      params: [
        notification.id,
        ticket.id,
        company.id,
        submitter.email,
        subject,
        notification.status,
        notification.errorMessage,
        iso(notification.offsetMinutes),
        notification.status === 'sent' ? iso(notification.offsetMinutes) : null,
      ],
    })
    const actor = ticket.completedBy ?? ticket.submitter
    await log(
      `${notification.id}-log`,
      actor,
      'notified',
      `完成通知：${notification.status === 'sent' ? '已发送' : notification.status === 'failed' ? '发送失败' : '未配置'}`,
      { notificationId: notification.id, status: notification.status, attempt: 1, recipientEmail: submitter.email, errorMessage: notification.errorMessage },
      notification.offsetMinutes,
    )
  }
}
