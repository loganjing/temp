import type { DbClient } from '@commonapp/dbkit'

export type OutboxItem = {
  id: number
  ticketId: number
  ticketNo: string
  kind: string
  toEmail: string
  subject: string
  body: string
  status: string
  createdAt: string
}

// 完成通知：与完成事务原子提交的发件箱写入（记录式投递，未完成工单不产生记录）。
export async function enqueueCompletionNotice(
  db: DbClient,
  input: { ticketId: number; ticketNo: string; subject: string; toEmail: string; completedByName: string; completedAt: string },
): Promise<void> {
  const subject = `[${input.ticketNo}] 工单完成通知：${input.subject}`
  const body = [
    '您的工单已完成处理。',
    '',
    `工单编号：${input.ticketNo}`,
    `主题：${input.subject}`,
    `完成时间：${input.completedAt}`,
    `处理人：${input.completedByName}`,
  ].join('\n')
  await db.run({
    text: 'INSERT INTO mail_outbox (ticket_id, kind, to_email, subject, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    params: [input.ticketId, 'ticket_completed_notice', input.toEmail, subject, body, 'recorded', input.completedAt],
  })
}

// 邮件发送记录：仅返回当前用户公司工单的邮件记录。
export async function listMailOutbox(
  db: DbClient,
  companyId: number,
  query: { ticketId?: number; page: number; pageSize: number },
): Promise<{ items: OutboxItem[]; total: number; page: number; pageSize: number }> {
  const conditions = ['t.company_id = ?']
  const params: unknown[] = [companyId]
  if (query.ticketId !== undefined) {
    conditions.push('m.ticket_id = ?')
    params.push(query.ticketId)
  }
  const where = conditions.join(' AND ')
  const totalRow = await db.queryOne<{ total: number }>({
    text: `SELECT COUNT(*) AS total FROM mail_outbox m JOIN tickets t ON t.id = m.ticket_id WHERE ${where}`,
    params,
  })
  const items = await db.queryAll<OutboxItem>({
    text: `SELECT m.id, m.ticket_id AS ticketId, t.ticket_no AS ticketNo, m.kind, m.to_email AS toEmail, m.subject, m.body, m.status, m.created_at AS createdAt
      FROM mail_outbox m JOIN tickets t ON t.id = m.ticket_id
      WHERE ${where}
      ORDER BY m.id DESC
      LIMIT ? OFFSET ?`,
    params: [...params, query.pageSize, (query.page - 1) * query.pageSize],
  })
  return { items, total: totalRow?.total ?? 0, page: query.page, pageSize: query.pageSize }
}
