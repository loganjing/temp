// Assignment engine: category → rule → multi-team round robin (persisted
// cursors) → member filter (enabled, non-manager, not on leave) → team-manager
// fallback → pending-assign failure record (requirements §6.2 / AC-03).
// Department assign_mode is deliberately ignored by routing (§9).
import type { DbClient } from '@commonapp/dbkit'
import type { Locale, Ref, UserRef } from '../../shared/domain'
import { dateKeyOf, loadCalendar } from './calendar'
import { serializeUserRef } from './serialize'
import type { AssignmentResult } from '../../shared/domain'
import type { BizUserRow, TeamRow } from './rows'

export interface AssignmentCandidate {
  userId: number
  team: TeamRow
  fallback?: 'manager'
}

export interface AssignmentOutcome {
  result: 'assigned' | 'pending_assign'
  teamId: number | null
  assigneeId: number | null
  fallback: 'manager' | null
  reason: string | null
  reasonEn: string | null
}

async function todayKey(db: DbClient): Promise<string> {
  const calendar = await loadCalendar(db)
  return dateKeyOf(new Date(), calendar.config.timezone)
}

/** Users currently on leave (today inside a vacation range, calendar timezone). */
export async function usersOnLeaveToday(db: DbClient): Promise<Set<number>> {
  const today = await todayKey(db)
  const rows = await db.queryAll<{ user_id: number }>({
    text: 'SELECT DISTINCT user_id FROM vacations WHERE start_date <= ? AND end_date >= ?',
    params: [today, today],
  })
  return new Set(rows.map((r) => r.user_id))
}

/** Future-or-active vacation state used by member cards (§6.6). */
export async function activeVacationOf(db: DbClient, userId: number): Promise<{ state: 'on_leave' | 'scheduled'; startDate: string; endDate: string; autoReplyText?: string } | null> {
  const today = await todayKey(db)
  const row = await db.queryOne<{ start_date: string; end_date: string; auto_reply_text: string | null }>({
    text: `SELECT start_date, end_date, auto_reply_text FROM vacations
           WHERE user_id = ? AND end_date >= ?
           ORDER BY start_date LIMIT 1`,
    params: [userId, today],
  })
  if (!row) return null
  const state = row.start_date <= today ? 'on_leave' : 'scheduled'
  return { state, startDate: row.start_date, endDate: row.end_date, autoReplyText: row.auto_reply_text ?? undefined }
}

async function pickRoundRobin(db: DbClient, scope: string, count: number): Promise<number> {
  const row = await db.queryOne<{ last_value: number }>({
    text: 'SELECT last_value FROM round_robin_cursors WHERE scope = ?',
    params: [scope],
  })
  return row ? (row.last_value + 1) % count : 0
}

async function bumpCursor(db: DbClient, scope: string, value: number, now: string): Promise<void> {
  await db.run({
    text: `INSERT INTO round_robin_cursors (scope, last_value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(scope) DO UPDATE SET last_value = excluded.last_value, updated_at = excluded.updated_at`,
    params: [scope, value, now],
  })
}

interface ExecutedAssignment {
  status: 'assigned' | 'pending_assign'
  teamId: number | null
  assigneeId: number | null
  fallback: 'manager' | null
  reasonZh: string
  reasonEn: string
}

/**
 * Runs the full routing chain for a submitted ticket. Must be called inside
 * the ticket transaction so cursor updates commit atomically.
 */
export async function runAssignment(
  db: DbClient,
  categoryId: number,
  now: string,
): Promise<ExecutedAssignment> {
  const rule = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM assignment_rules WHERE category_id = ?',
    params: [categoryId],
  })
  if (!rule) {
    return {
      status: 'pending_assign',
      teamId: null,
      assigneeId: null,
      fallback: null,
      reasonZh: '该分类未配置分配规则',
      reasonEn: 'No assignment rule configured for the category',
    }
  }
  const teams = await db.queryAll<TeamRow>({
    text: `SELECT t.id, t.department_id, t.code, t.name_zh, t.name_en, t.status FROM teams t
           JOIN assignment_rule_targets art ON art.team_id = t.id
           WHERE art.rule_id = ? AND t.status = 1
           ORDER BY t.id`,
    params: [rule.id],
  })
  if (teams.length === 0) {
    return {
      status: 'pending_assign',
      teamId: null,
      assigneeId: null,
      fallback: null,
      reasonZh: '分配规则未配置可用目标 Team',
      reasonEn: 'Assignment rule has no active target team',
    }
  }

  // Team-level round robin (persisted cursor, restart-safe).
  const teamIndex = await pickRoundRobin(db, `rule:${rule.id}`, teams.length)
  const team = teams[teamIndex]
  await bumpCursor(db, `rule:${rule.id}`, teamIndex, now)

  const onLeave = await usersOnLeaveToday(db)
  // Member-level round robin over eligible members (enabled, non-manager, not on leave).
  const members = await db.queryAll<BizUserRow>({
    text: `SELECT u.id, u.credential_user_id, u.name_zh, u.name_en, u.email, u.phone, u.role, u.company_id, u.status
           FROM team_members tm JOIN biz_users u ON u.id = tm.user_id
           WHERE tm.team_id = ? AND u.status = 1 AND u.role != 'manager'
           ORDER BY u.id`,
    params: [team.id],
  })
  const eligible = members.filter((m) => !onLeave.has(m.id))
  if (eligible.length > 0) {
    const memberIndex = await pickRoundRobin(db, `member:${team.id}`, eligible.length)
    const assignee = eligible[memberIndex]
    await bumpCursor(db, `member:${team.id}`, memberIndex, now)
    return { status: 'assigned', teamId: team.id, assigneeId: assignee.id, fallback: null, reasonZh: '', reasonEn: '' }
  }

  // Fallback: on-duty manager of the team's department (never another team, §6.2).
  const managers = await db.queryAll<BizUserRow>({
    text: `SELECT u.id, u.credential_user_id, u.name_zh, u.name_en, u.email, u.phone, u.role, u.company_id, u.status
           FROM department_managers dm JOIN biz_users u ON u.id = dm.user_id
           WHERE dm.department_id = ? AND u.status = 1
           ORDER BY u.id`,
    params: [team.department_id],
  })
  const onDutyManager = managers.find((m) => !onLeave.has(m.id))
  if (onDutyManager) {
    return {
      status: 'assigned',
      teamId: team.id,
      assigneeId: onDutyManager.id,
      fallback: 'manager',
      reasonZh: '目标 Team 无可用成员，回退分配给部门经理',
      reasonEn: 'No eligible member in the target team; fell back to the department manager',
    }
  }

  return {
    status: 'pending_assign',
    teamId: team.id,
    assigneeId: null,
    fallback: null,
    reasonZh: '目标 Team 全员不可用（停用或休假），且部门经理也不可用',
    reasonEn: 'All target team members and the department manager are unavailable',
  }
}

export async function buildAssignmentResult(
  db: DbClient,
  executed: ExecutedAssignment,
  locale: Locale,
): Promise<AssignmentResult> {
  if (executed.status === 'pending_assign') {
    const team = executed.teamId
      ? await db.queryOne<TeamRow>({ text: 'SELECT * FROM teams WHERE id = ?', params: [executed.teamId] })
      : null
    return {
      result: 'pending_assign',
      team: team ? { id: team.id, nameZh: team.name_zh, nameEn: team.name_en } : undefined,
      reason: locale === 'zh' ? executed.reasonZh : executed.reasonEn,
    }
  }
  const team = executed.teamId
    ? await db.queryOne<TeamRow>({ text: 'SELECT * FROM teams WHERE id = ?', params: [executed.teamId] })
    : null
  const assigneeRow = executed.assigneeId
    ? await db.queryOne<BizUserRow>({ text: 'SELECT * FROM biz_users WHERE id = ?', params: [executed.assigneeId] })
    : null
  const assignee = serializeUserRef(locale, assigneeRow) ?? undefined
  return {
    result: 'assigned',
    team: team ? { id: team.id, nameZh: team.name_zh, nameEn: team.name_en } : undefined,
    assignee,
    fallback: executed.fallback ?? undefined,
  }
}

export type { Ref, UserRef }
