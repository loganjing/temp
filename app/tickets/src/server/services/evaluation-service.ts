import type { DbClient } from '@commonapp/dbkit'
import type { AuditEvent } from '@commonapp/auditkit'

const now = () => new Date().toISOString()

export async function createEvaluation(
  db: DbClient,
  auditKit: { record: (e: AuditEvent) => Promise<void> },
  params: {
    ticketId: number
    companyId: string
    rating: number
    comment?: string | null
    actorId: string
    actorName: string
  },
): Promise<{ error?: string; result?: { id: string; ticketId: string; rating: number; comment: string | null; createdAt: string } }> {
  // Verify ticket exists, belongs to company, and is completed
  const ticket = await db.queryOne<{ id: number; status: string; company_id: string }>({
    text: 'SELECT id, status, company_id FROM tickets WHERE id = ? AND company_id = ?',
    params: [params.ticketId, params.companyId],
  })
  if (!ticket) return { error: 'ticket_not_found' }
  if (ticket.status !== 'completed') return { error: 'ticket_not_completed' }

  // Check for existing evaluation (UNIQUE constraint on ticket_id)
  const existing = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM ticket_evaluations WHERE ticket_id = ?',
    params: [params.ticketId],
  })
  if (existing) return { error: 'already_evaluated' }

  const ts = now()
  await db.run({
    text: 'INSERT INTO ticket_evaluations (ticket_id, rating, comment, created_at) VALUES (?, ?, ?, ?)',
    params: [params.ticketId, params.rating, params.comment ?? null, ts],
  })
  const row = await db.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })

  await auditKit.record({
    type: 'ticket:evaluate',
    occurredAt: ts,
    actorUserId: params.actorId,
    metadata: { actorName: params.actorName, entityType: 'evaluation', entityId: String(params.ticketId), rating: params.rating },
  })

  return {
    result: {
      id: String(row?.id ?? 0),
      ticketId: String(params.ticketId),
      rating: params.rating,
      comment: params.comment ?? null,
      createdAt: ts,
    },
  }
}

export async function getEvaluation(
  db: DbClient,
  ticketId: number,
  companyId: string,
): Promise<{ id: string; ticketId: string; rating: number; comment: string | null; createdAt: string } | null> {
  // Verify ticket belongs to company
  const ticket = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM tickets WHERE id = ? AND company_id = ?',
    params: [ticketId, companyId],
  })
  if (!ticket) return null

  const evalRow = await db.queryOne<{ id: number; ticket_id: number; rating: number; comment: string | null; created_at: string }>({
    text: 'SELECT * FROM ticket_evaluations WHERE ticket_id = ?',
    params: [ticketId],
  })
  if (!evalRow) return null

  return {
    id: String(evalRow.id),
    ticketId: String(evalRow.ticket_id),
    rating: evalRow.rating,
    comment: evalRow.comment,
    createdAt: evalRow.created_at,
  }
}
