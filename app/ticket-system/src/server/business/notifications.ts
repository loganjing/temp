import type { DbClient } from '@commonapp/dbkit'
import type { Hono } from 'hono'
import { findSessionProfile } from './session'
import type { Notification } from './types'

export function registerNotificationRoutes(app: Hono, db: DbClient): void {
  // 当前登录用户为收件人的完成通知；无业务档案的登录用户视为没有通知。
  app.get('/api/notifications', async (c) => {
    const profile = await findSessionProfile(db, c)
    if (!profile) return c.json({ items: [] })
    const rows = await db.queryAll<{ id: number; ticket_id: number; ticket_no: string; subject: string; body: string; created_at: string }>({
      text: `SELECT n.id, n.ticket_id, t.ticket_no, n.subject, n.body, n.created_at
        FROM email_notifications n JOIN tickets t ON t.id = n.ticket_id
        WHERE n.recipient_user_id = ? ORDER BY n.created_at DESC, n.id DESC`,
      params: [profile.id],
    })
    const items: Notification[] = rows.map((row) => ({
      id: row.id,
      ticketId: row.ticket_id,
      ticketNo: row.ticket_no,
      subject: row.subject,
      body: row.body,
      createdAt: row.created_at,
    }))
    return c.json({ items })
  })
}
