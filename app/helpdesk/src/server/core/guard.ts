// Unified permission guard: role + object relation + ticket status.
// Every write route funnels through these checks (requirements §2.3 / §8, AC-17).
import type { DbClient } from '@commonapp/dbkit'
import type { SessionUser, UserRow } from './session'
import { forbidden, notFound } from './errors'
import type { TicketRow } from './rows'

export interface TicketRowBase {
  id: number
  status: string
  requester_id: number
  assignee_id: number | null
  team_id: number | null
  department_id: number | null
}

/** Manager scope: teams the user belongs to ∪ departments the user manages (§2.3). */
export async function managerScope(db: DbClient, userId: number): Promise<{ teamIds: number[]; departmentIds: number[] }> {
  const teamRows = await db.queryAll<{ team_id: number }>({
    text: 'SELECT team_id AS team_id FROM team_members WHERE user_id = ?',
    params: [userId],
  })
  const departmentRows = await db.queryAll<{ department_id: number }>({
    text: 'SELECT department_id AS department_id FROM department_managers WHERE user_id = ?',
    params: [userId],
  })
  return {
    teamIds: teamRows.map((r) => r.team_id),
    departmentIds: departmentRows.map((r) => r.department_id),
  }
}

export async function isDepartmentManagerOf(db: DbClient, userId: number, departmentId: number): Promise<boolean> {
  const row = await db.queryOne<{ user_id: number }>({
    text: 'SELECT user_id FROM department_managers WHERE department_id = ? AND user_id = ?',
    params: [departmentId, userId],
  })
  return row !== null
}

export async function isTeamManagerOf(db: DbClient, userId: number, teamId: number): Promise<boolean> {
  const row = await db.queryOne<{ department_id: number }>({
    text: `SELECT t.department_id AS department_id FROM teams t
           WHERE t.id = ? AND EXISTS (
             SELECT 1 FROM department_managers dm WHERE dm.department_id = t.department_id AND dm.user_id = ?
           )`,
    params: [teamId, userId],
  })
  return row !== null
}

/** Read visibility. Object-level; unauthorized reads surface as 404 (anti-enumeration). */
export function canViewTicket(user: SessionUser, ticket: TicketRowBase): boolean {
  if (ticket.status === 'draft') return ticket.requester_id === user.id
  switch (user.role) {
    case 'admin':
      return true
    case 'manager':
      // Scope check is delegated to the SQL scope predicate for lists; for a
      // single ticket we approximate with the loaded scope flags below.
      return false
    case 'agent':
      return ticket.assignee_id === user.id
    default:
      return ticket.requester_id === user.id
  }
}

/** Manager single-ticket visibility with dynamic scope (teams ∪ managed departments). */
export async function canManagerViewTicket(db: DbClient, user: SessionUser, ticket: TicketRowBase): Promise<boolean> {
  const scope = await managerScope(db, user.id)
  if (ticket.department_id !== null && scope.departmentIds.includes(ticket.department_id)) return true
  if (ticket.team_id !== null && scope.teamIds.includes(ticket.team_id)) return true
  return false
}

/** Ticket visibility as a boolean; write paths surface false as 403 (contract §1 keeps 404 for reads). */
export async function ticketVisibleTo(db: DbClient, user: SessionUser, ticket: TicketRowBase): Promise<boolean> {
  if (ticket.status === 'draft') return ticket.requester_id === user.id
  switch (user.role) {
    case 'admin':
      return true
    case 'manager':
      return canManagerViewTicket(db, user, ticket)
    case 'agent':
      return ticket.assignee_id === user.id
    default:
      return ticket.requester_id === user.id
  }
}

export async function assertTicketVisible(db: DbClient, user: SessionUser, ticket: TicketRowBase, message: string): Promise<void> {
  if (!(await ticketVisibleTo(db, user, ticket))) throw notFound(message)
}

/** Whether the user may act on the ticket as "handling side" (assignee or scope manager). */
export async function isHandlingSide(db: DbClient, user: SessionUser, ticket: TicketRowBase): Promise<boolean> {
  if (user.role === 'admin') return true
  if (user.role === 'manager') return canManagerViewTicket(db, user, ticket)
  if (user.role === 'agent') return ticket.assignee_id === user.id
  return false
}

export async function assertCanReply(db: DbClient, user: SessionUser, ticket: TicketRowBase, message: string): Promise<void> {
  if (['closed', 'cancelled', 'draft'].includes(ticket.status)) throw forbidden(message)
  if (user.role === 'admin') return
  if (user.role === 'requester') {
    if (ticket.requester_id !== user.id) throw notFound(message)
    return
  }
  if (user.role === 'agent') {
    if (ticket.assignee_id !== user.id) throw notFound(message)
    return
  }
  // Manager: own-scope ticket (may claim an unassigned one by replying).
  if (!(await canManagerViewTicket(db, user, ticket))) throw notFound(message)
}

export async function userExistsAndActive(db: DbClient, userId: number): Promise<UserRow | null> {
  const row = await db.queryOne<UserRow>({
    text: 'SELECT * FROM biz_users WHERE id = ? AND status = 1',
    params: [userId],
  })
  return row ?? null
}

export type { TicketRow }
