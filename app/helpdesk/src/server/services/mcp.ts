// MCP tool service (contract §13): create_ticket equals "draft + submit" with
// the same idempotency key, plus best-effort attachmentUrl downloads that
// never block ticket creation.
import type { DbClient } from '@commonapp/dbkit'
import type { AssignmentResult, Locale } from '../../shared/domain'
import { validation } from '../core/errors'
import type { SessionUser } from '../core/session'
import type { AttachmentService } from '../platform/attachments'
import { insertActivity } from './audit'
import { createDraft, submitTicket, type TicketDraftInput } from './tickets'

export interface CreateTicketArgs {
  subjectZh: string
  subjectEn?: string
  description: string
  categoryId: number
  subCategoryId?: number
  priority: string
  attachmentUrl?: string
  attachmentUrls?: string[]
  idempotencyKey: string
}

export interface McpCreateTicketResult {
  id: number
  ticketNo: string | null
  status: string
  assignment: AssignmentResult
}

export async function mcpCreateTicket(
  db: DbClient,
  attachments: AttachmentService,
  user: SessionUser,
  args: CreateTicketArgs,
  locale: Locale,
): Promise<McpCreateTicketResult> {
  if (!args.idempotencyKey) {
    throw validation(locale === 'zh' ? '缺少幂等键' : 'idempotencyKey is required', ['idempotencyKey'])
  }
  const input: TicketDraftInput = {
    subjectZh: args.subjectZh,
    subjectEn: args.subjectEn ?? null,
    description: args.description,
    categoryId: args.categoryId,
    subCategoryId: args.subCategoryId ?? null,
    priority: args.priority,
  }
  const { ticket } = await createDraft(db, user, input, args.idempotencyKey, locale)
  const outcome = await submitTicket(db, user, ticket.id, args.idempotencyKey, locale)
  const urls = [...(args.attachmentUrl ? [args.attachmentUrl] : []), ...(args.attachmentUrls ?? [])]
  for (const url of urls) {
    if (!url) continue
    try {
      await attachments.saveMcpDownload(user, ticket.id, url)
    } catch (error) {
      // Best effort: log the failure into the activity stream (contract §13).
      const reason = error instanceof Error ? error.message : String(error)
      console.error(`[mcp] attachment download failed (ticket=${ticket.id}):`, reason)
      await insertActivity(
        db,
        {
          ticketId: ticket.id,
          actorId: user.id,
          action: 'mcp_attachment_failed',
          remarkZh: `灵基智能体附件未挂接：${url}（${reason}）`,
          remarkEn: `MCP attachment not attached: ${url} (${reason})`,
          source: 'mcp',
        },
        new Date().toISOString(),
      )
    }
  }
  return {
    id: outcome.ticket.id,
    ticketNo: outcome.ticket.ticketNo,
    status: outcome.ticket.status,
    assignment: outcome.assignment,
  }
}
