// SLA dual-clock engine: badge states, alert predicate, deadline recomputation.
// All consumers (list badges, department board, dashboard, embed) share these
// functions so counts and drill-down lists reconcile exactly (contract §7.2).
import type { DbClient } from '@commonapp/dbkit'
import type { Locale, SlaBadge, TicketStatus } from '../../shared/domain'
import { addWorkingMinutes, dateKeyOf, dayRangeOf, loadCalendar, shiftIso } from './calendar'
import { message } from './messages'
import { SLA_ALERT_EXCLUDED_STATUSES } from '../../shared/domain'
import type { SlaPolicyRow, TicketRow } from './rows'

const MINUTE_MS = 60_000

export interface SlaContext {
  policy: SlaPolicyRow | null
}

export async function loadSlaPolicyForCategory(db: DbClient, categoryId: number): Promise<SlaPolicyRow | null> {
  return db.queryOne<SlaPolicyRow>({
    text: 'SELECT id, category_id, first_response_minutes, resolution_minutes, warn_threshold_percent FROM sla_policies WHERE category_id = ?',
    params: [categoryId],
  })
}

function formatDuration(ms: number, locale: Locale): string {
  const totalMinutes = Math.max(0, Math.round(ms / MINUTE_MS))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days}${message(locale, 'day')}`)
  if (hours > 0) parts.push(`${hours}${message(locale, 'hour')}`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}${message(locale, 'minute')}`)
  return parts.join(' ')
}

interface BadgeInput {
  state: 'normal' | 'warning' | 'breached' | 'met' | 'missed' | 'paused'
  text: string
}

function notConfiguredBadge(locale: Locale): SlaBadge {
  return { state: 'normal', text: message(locale, 'slaNotConfigured') }
}

function notStartedBadge(locale: Locale): SlaBadge {
  return { state: 'normal', text: message(locale, 'slaNotStarted') }
}

/** First-response clock badge (contract §7.1). */
export function firstResponseBadge(
  ticket: Pick<TicketRow, 'status' | 'first_response_at' | 'sla_first_response_deadline'>,
  policy: SlaPolicyRow | null,
  now: Date,
  locale: Locale,
): SlaBadge {
  if (!policy) return notConfiguredBadge(locale)
  if (ticket.status === 'on_hold' && !ticket.first_response_at) {
    return { state: 'paused', text: message(locale, 'slaPaused') }
  }
  const deadline = ticket.sla_first_response_deadline
  if (ticket.first_response_at) {
    const met = deadline ? ticket.first_response_at <= deadline : true
    return { state: met ? 'met' : 'missed', text: message(locale, met ? 'slaMet' : 'slaMissed') }
  }
  if (!deadline) return notStartedBadge(locale)
  return pendingBadge(deadline, policy.warn_threshold_percent, policy.first_response_minutes, now, locale)
}

/** Resolution clock badge (contract §7.1). */
export function resolutionBadge(
  ticket: Pick<TicketRow, 'status' | 'closed_at' | 'sla_resolution_deadline' | 'resolution_start_at'>,
  policy: SlaPolicyRow | null,
  now: Date,
  locale: Locale,
): SlaBadge {
  if (!policy) return notConfiguredBadge(locale)
  if (ticket.status === 'on_hold') return { state: 'paused', text: message(locale, 'slaPaused') }
  const deadline = ticket.sla_resolution_deadline
  if (ticket.closed_at) {
    const met = deadline ? ticket.closed_at <= deadline : true
    return { state: met ? 'met' : 'missed', text: message(locale, met ? 'slaMet' : 'slaMissed') }
  }
  if (!ticket.resolution_start_at) return notStartedBadge(locale)
  if (!deadline) return notStartedBadge(locale)
  return pendingBadge(deadline, policy.warn_threshold_percent, policy.resolution_minutes, now, locale)
}

function pendingBadge(deadline: string, warnPercent: number, limitMinutes: number, now: Date, locale: Locale): SlaBadge {
  const nowMs = now.getTime()
  const deadlineMs = new Date(deadline).getTime()
  if (nowMs > deadlineMs) {
    return { state: 'breached', text: message(locale, 'slaBreached', { duration: formatDuration(nowMs - deadlineMs, locale) }) }
  }
  const remaining = deadlineMs - nowMs
  const warnWindow = (warnPercent / 100) * limitMinutes * MINUTE_MS
  if (remaining <= warnWindow) {
    return { state: 'warning', text: message(locale, 'slaRemaining', { duration: formatDuration(remaining, locale) }) }
  }
  return { state: 'normal', text: message(locale, 'slaRemaining', { duration: formatDuration(remaining, locale) }) }
}

/**
 * Shared alert predicate. `warning|breached` on either clock with the
 * ticket outside excluded statuses. Because warn thresholds are policy data,
 * the check is evaluated per candidate row rather than in pure SQL.
 */
export function isSlaAlert(ticket: TicketRow, policy: SlaPolicyRow | null, now: Date): boolean {
  if (SLA_ALERT_EXCLUDED_STATUSES.includes(ticket.status as TicketStatus)) return false
  if (ticket.status === 'draft') return false
  const nowMs = now.getTime()
  // First-response clock
  if (policy && !ticket.first_response_at && ticket.sla_first_response_deadline) {
    const deadlineMs = new Date(ticket.sla_first_response_deadline).getTime()
    if (nowMs > deadlineMs) return true
    const remaining = deadlineMs - nowMs
    if (remaining <= (policy.warn_threshold_percent / 100) * policy.first_response_minutes * MINUTE_MS) return true
  }
  // Resolution clock
  if (policy && !ticket.closed_at && ticket.sla_resolution_deadline && ticket.resolution_start_at) {
    const deadlineMs = new Date(ticket.sla_resolution_deadline).getTime()
    if (nowMs > deadlineMs) return true
    const remaining = deadlineMs - nowMs
    if (remaining <= (policy.warn_threshold_percent / 100) * policy.resolution_minutes * MINUTE_MS) return true
  }
  return false
}

/** Both deadlines from origin points (submit / first handling action). */
export function computeDeadlines(
  ticket: Pick<TicketRow, 'submitted_at' | 'resolution_start_at'>,
  policy: SlaPolicyRow,
  calendar: Awaited<ReturnType<typeof loadCalendar>>,
): { firstResponse: string | null; resolution: string | null } {
  return {
    firstResponse: ticket.submitted_at
      ? addWorkingMinutes(ticket.submitted_at, policy.first_response_minutes, calendar)
      : null,
    resolution: ticket.resolution_start_at
      ? addWorkingMinutes(ticket.resolution_start_at, policy.resolution_minutes, calendar)
      : null,
  }
}

/** Hold deferral: shift both live deadlines by the paused duration. */
export function deferDeadlinesForHold(
  ticket: Pick<TicketRow, 'sla_first_response_deadline' | 'sla_resolution_deadline' | 'first_response_at'>,
  pausedMs: number,
): { firstResponse: string | null; resolution: string | null } {
  const firstResponse = ticket.sla_first_response_deadline
    ? shiftIso(ticket.sla_first_response_deadline, pausedMs)
    : null
  const resolution = ticket.sla_resolution_deadline
    ? shiftIso(ticket.sla_resolution_deadline, pausedMs)
    : null
  return { firstResponse, resolution }
}

export function todayRange(db: DbClient): Promise<{ start: string; end: string }> {
  return loadCalendar(db).then((calendar) => dayRangeOf(new Date(), calendar.config.timezone))
}

export function todayKey(db: DbClient): Promise<string> {
  return loadCalendar(db).then((calendar) => dateKeyOf(new Date(), calendar.config.timezone))
}
