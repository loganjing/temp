// Background job: pending_confirm timeout scan. Tickets left unconfirmed past
// the configured timeout close automatically with a system-default 5-star
// rating (requirements §6.9 / AC-15).
import type { DbClient } from '@commonapp/dbkit'
import { insertActivity } from '../services/audit'

export interface AutoCloseOptions {
  timeoutMs: number
  scanIntervalMs: number
}

export function autoCloseOptionsFromEnv(env: NodeJS.ProcessEnv): AutoCloseOptions {
  return {
    timeoutMs: Number(env.PENDING_CONFIRM_TIMEOUT_MS) || 24 * 3_600_000,
    scanIntervalMs: Number(env.AUTO_CLOSE_SCAN_INTERVAL_MS) || 5 * 60_000,
  }
}

export async function scanPendingConfirmTimeouts(
  db: DbClient,
  timeoutMs: number,
  now = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - timeoutMs).toISOString()
  const rows = await db.queryAll<{ id: number }>({
    text: `SELECT id FROM tickets
           WHERE status = 'pending_confirm' AND resolved_at IS NOT NULL AND resolved_at <= ?`,
    params: [cutoff],
  })
  let closed = 0
  for (const row of rows) {
    const nowIso = now.toISOString()
    await db.transaction(async (tx) => {
      const updated = await tx.run({
        text: `UPDATE tickets SET status = 'closed', closed_at = ?, updated_at = ?
               WHERE id = ? AND status = 'pending_confirm'`,
        params: [nowIso, nowIso, row.id],
      })
      if (updated.changes === 0) return
      const existingRating = await tx.queryOne<{ id: number }>({
        text: 'SELECT id FROM ratings WHERE ticket_id = ?',
        params: [row.id],
      })
      if (!existingRating) {
        await tx.run({
          text: `INSERT INTO ratings (ticket_id, score, comment, is_system_default, created_at)
                 VALUES (?, 5, NULL, 1, ?)`,
          params: [row.id, nowIso],
        })
      }
      await insertActivity(
        tx,
        {
          ticketId: row.id,
          actorId: null,
          action: 'auto_close',
          fromStatus: 'pending_confirm',
          toStatus: 'closed',
          remarkZh: '待确认超时，系统自动关闭工单并记录默认好评',
          remarkEn: 'Confirmation timed out; the system closed the ticket with the default rating',
          source: 'system',
        },
        nowIso,
      )
      closed += 1
    })
  }
  return closed
}

export function startAutoCloseJob(db: DbClient, options: AutoCloseOptions): { stop: () => void } {
  if (options.scanIntervalMs <= 0) return { stop: () => undefined }
  const handle = setInterval(() => {
    void scanPendingConfirmTimeouts(db, options.timeoutMs).catch((error) => {
      console.error('[auto-close] scan failed:', error instanceof Error ? error.message : error)
    })
  }, options.scanIntervalMs)
  ;(handle as { unref?: () => void }).unref?.()
  return { stop: () => clearInterval(handle) }
}
