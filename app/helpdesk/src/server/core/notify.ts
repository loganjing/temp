// Notification service: exactly two trigger points (ticket submit and reply).
// Fire-and-forget after the transaction; failures only log (contract §9, AC-20).
import type { DbClient } from '@commonapp/dbkit'
import type { Locale } from '../../shared/domain'
import { message } from './messages'
import { sendMail, smtpOptionsFromEnv, type SmtpOptions } from './smtp'
import type { BizUserRow, TicketRow } from './rows'

type MailTrigger =
  | { kind: 'ticket_created'; ticket: TicketRow; requester: BizUserRow | null }
  | { kind: 'assignee_notified'; ticket: TicketRow; assignee: BizUserRow | null }
  | { kind: 'requester_replied'; ticket: TicketRow; assignee: BizUserRow | null }
  | { kind: 'assignee_replied'; ticket: TicketRow; requester: BizUserRow | null }

function mailSubjectAndBody(
  trigger: MailTrigger,
  options: SmtpOptions,
): { to: string; subject: string; text: string } | null {
  const ticketNo = trigger.ticket.ticket_no ?? String(trigger.ticket.id)
  const subject = trigger.ticket.subject_zh || trigger.ticket.subject_en || ticketNo
  const build = (to: string, subjectKey: string, bodyKey: string) => ({
    to,
    subject: message('zh', subjectKey, { ticketNo }),
    text: message('zh', bodyKey, { ticketNo, subject }),
  })
  switch (trigger.kind) {
    case 'ticket_created':
      return trigger.requester ? build(trigger.requester.email, 'mailCreatedSubject', 'mailCreatedBody') : null
    case 'assignee_notified':
      return trigger.assignee ? build(trigger.assignee.email, 'mailAssignedSubject', 'mailAssignedBody') : null
    case 'requester_replied':
      return trigger.assignee ? build(trigger.assignee.email, 'mailRequesterRepliedSubject', 'mailRequesterRepliedBody') : null
    case 'assignee_replied':
      return trigger.requester ? build(trigger.requester.email, 'mailAssigneeRepliedSubject', 'mailAssigneeRepliedBody') : null
    default:
      return null
  }
}

async function dispatch(trigger: MailTrigger): Promise<void> {
  const options = smtpOptionsFromEnv(process.env)
  if (!options) {
    // Silent skip when no SMTP host is configured (debug level noise avoided).
    return
  }
  const mail = mailSubjectAndBody(trigger, options)
  if (!mail) return
  try {
    await sendMail(options, mail)
  } catch (error) {
    console.error(
      `[notify] mail send failed (trigger=${trigger.kind} ticket=${trigger.ticket.id}):`,
      error instanceof Error ? error.message : error,
    )
  }
}

function schedule(trigger: MailTrigger): void {
  // Fire-and-forget: never blocks the API response.
  void dispatch(trigger).catch((error) => {
    console.error('[notify] unexpected mail dispatch failure', error)
  })
}

/** Ticket submitted: requester confirmation + assignee notice when auto-assigned on the spot. */
export function notifyTicketSubmitted(
  db: DbClient,
  ticket: TicketRow,
): void {
  void (async () => {
    const requester = await db.queryOne<BizUserRow>({
      text: 'SELECT * FROM biz_users WHERE id = ?',
      params: [ticket.requester_id],
    })
    schedule({ kind: 'ticket_created', ticket, requester })
    if (ticket.assignee_id) {
      const assignee = await db.queryOne<BizUserRow>({
        text: 'SELECT * FROM biz_users WHERE id = ?',
        params: [ticket.assignee_id],
      })
      if (assignee && assignee.id !== ticket.requester_id) {
        schedule({ kind: 'assignee_notified', ticket, assignee })
      }
    }
  })()
}

/** Reply posted: notify the opposite side (requester ⇄ assignee). */
export function notifyReply(db: DbClient, ticket: TicketRow, authorId: number): void {
  void (async () => {
    if (authorId === ticket.requester_id) {
      if (!ticket.assignee_id) return
      const assignee = await db.queryOne<BizUserRow>({
        text: 'SELECT * FROM biz_users WHERE id = ?',
        params: [ticket.assignee_id],
      })
      schedule({ kind: 'requester_replied', ticket, assignee })
      return
    }
    const requester = await db.queryOne<BizUserRow>({
      text: 'SELECT * FROM biz_users WHERE id = ?',
      params: [ticket.requester_id],
    })
    schedule({ kind: 'assignee_replied', ticket, requester })
  })()
}

export type { Locale }
