// Embed workbench service (contract §11): requester-only KPI summary and the
// one-shot kanban board. Cards reuse the ticket list machinery so shapes stay
// identical to GET /api/tickets.
import type { DbClient } from '@commonapp/dbkit'
import { DONE_STATUSES, TEAM_PROCESSING_STATUSES, type Locale, type TicketSummary } from '../../shared/domain'
import { forbidden } from '../core/errors'
import { queryTickets, ticketScopeFor } from '../core/stats'
import type { SessionUser } from '../core/session'
import { toSummary } from './tickets'

const DEFAULT_KANBAN_LIMIT = 20

function requireRequester(user: SessionUser, locale: Locale): void {
  if (user.role !== 'requester') {
    throw forbidden(
      locale === 'zh' ? '嵌入式工作台仅对提交人角色开放' : 'The embed workbench is only available to requesters',
    )
  }
}

export interface EmbedSummary {
  kpis: {
    toProcess: number
    inProgress: number
    completed: number
    avgResolutionHours: number
  }
}

export async function embedSummary(db: DbClient, user: SessionUser, locale: Locale): Promise<EmbedSummary> {
  requireRequester(user, locale)
  const statusRows = await db.queryAll<{ status: string; total: number }>({
    text: 'SELECT status, COUNT(*) AS total FROM tickets WHERE requester_id = ? GROUP BY status',
    params: [user.id],
  })
  const countOf = (statuses: string[]): number =>
    statusRows
      .filter((row) => statuses.includes(row.status))
      .reduce((sum, row) => sum + Number(row.total), 0)
  const avgRow = await db.queryOne<{ avgHours: number | null }>({
    text: `SELECT AVG((julianday(closed_at) - julianday(resolution_start_at)) * 24) AS avgHours
           FROM tickets
           WHERE requester_id = ? AND status = 'closed' AND closed_at IS NOT NULL AND resolution_start_at IS NOT NULL`,
    params: [user.id],
  })
  return {
    kpis: {
      toProcess: countOf(['draft', 'pending_confirm']),
      inProgress: countOf(TEAM_PROCESSING_STATUSES),
      completed: countOf(DONE_STATUSES),
      avgResolutionHours: avgRow?.avgHours == null ? 0 : Math.round(Number(avgRow.avgHours) * 100) / 100,
    },
  }
}

export interface EmbedKanban {
  limit: number
  truncated: boolean
  columns: {
    drafts: TicketSummary[]
    teamProcessing: TicketSummary[]
    toConfirm: TicketSummary[]
    done: TicketSummary[]
  }
}

export async function embedKanban(db: DbClient, user: SessionUser, locale: Locale): Promise<EmbedKanban> {
  requireRequester(user, locale)
  const limit = Number(process.env.EMBED_KANBAN_LIMIT) || DEFAULT_KANBAN_LIMIT
  const scope = await ticketScopeFor(db, user)
  const column = async (statuses: string[]): Promise<{ cards: TicketSummary[]; truncated: boolean }> => {
    const page = await queryTickets(
      db,
      scope,
      { status: statuses },
      { column: 't.updated_at', direction: 'DESC' },
      1,
      limit,
    )
    const cards = await Promise.all(page.items.map((row) => toSummary(db, row, locale)))
    return { cards, truncated: page.total > limit }
  }
  const [drafts, teamProcessing, toConfirm, done] = await Promise.all([
    column(['draft']),
    column(TEAM_PROCESSING_STATUSES),
    column(['pending_confirm']),
    column(DONE_STATUSES),
  ])
  return {
    limit,
    truncated: drafts.truncated || teamProcessing.truncated || toConfirm.truncated || done.truncated,
    columns: {
      drafts: drafts.cards,
      teamProcessing: teamProcessing.cards,
      toConfirm: toConfirm.cards,
      done: done.cards,
    },
  }
}
