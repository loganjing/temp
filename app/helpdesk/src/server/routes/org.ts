// Organization & user management routes (contract §4): admin companies
// (tree/CRUD/CSV), departments, teams, members, vacations and admin users.
// Department-local maintenance (teams/members/vacations) also accepts the
// department's manager; team member reads widen to team members.
import type { Context, Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import { forbidden, validation } from '../core/errors'
import { message } from '../core/messages'
import { isDepartmentManagerOf, isTeamManagerOf, managerScope } from '../core/guard'
import { requestLocale, requireSession, type AppEnv, type SessionUser } from '../core/session'
import type { Platform } from '../platform/bootstrap'
import * as org from '../services/org'
import { csvResponse, numericParam, pageParam, requireAdmin, safeJsonBody, stringOf } from './helpers'

function statusOf(body: Record<string, unknown>): number | string | undefined {
  const value = body.status
  return typeof value === 'number' || typeof value === 'string' ? value : undefined
}

function idsOf(body: Record<string, unknown>, field: string): number[] | undefined {
  const value = body[field]
  return Array.isArray(value) ? value.map((id) => Number(id)) : undefined
}

function assignModeOf(body: Record<string, unknown>): 'auto' | 'manual' | undefined {
  const value = stringOf(body, 'assignMode')
  if (!value) return undefined
  // Invalid values pass through so the service rejects them (422 assignMode).
  return value === 'auto' || value === 'manual' ? value : (value as 'auto' | 'manual')
}

function companyInputFrom(body: Record<string, unknown>): org.CompanyInput {
  return {
    code: stringOf(body, 'code'),
    nameZh: stringOf(body, 'nameZh'),
    nameEn: stringOf(body, 'nameEn') || null,
    parentId: body.parentId === undefined || body.parentId === null ? null : Number(body.parentId),
    status: statusOf(body),
  }
}

function companyPatchFrom(body: Record<string, unknown>): { nameZh?: string; nameEn?: string | null; status?: number | string } {
  const patch: { nameZh?: string; nameEn?: string | null; status?: number | string } = {}
  if (body.nameZh !== undefined) patch.nameZh = stringOf(body, 'nameZh')
  if (body.nameEn !== undefined) patch.nameEn = stringOf(body, 'nameEn') || null
  if (body.status !== undefined) patch.status = statusOf(body)
  return patch
}

function departmentInputFrom(body: Record<string, unknown>): org.DepartmentInput {
  return {
    code: stringOf(body, 'code'),
    nameZh: stringOf(body, 'nameZh'),
    nameEn: stringOf(body, 'nameEn') || null,
    managerIds: idsOf(body, 'managerIds') ?? [],
    assignMode: assignModeOf(body),
    status: statusOf(body),
  }
}

function departmentPatchFrom(body: Record<string, unknown>): Partial<org.DepartmentInput> {
  const patch: Partial<org.DepartmentInput> = {}
  if (body.nameZh !== undefined) patch.nameZh = stringOf(body, 'nameZh')
  if (body.nameEn !== undefined) patch.nameEn = stringOf(body, 'nameEn') || null
  if (body.managerIds !== undefined) patch.managerIds = idsOf(body, 'managerIds') ?? []
  if (body.assignMode !== undefined) patch.assignMode = assignModeOf(body)
  if (body.status !== undefined) patch.status = statusOf(body)
  return patch
}

function teamInputFrom(body: Record<string, unknown>): org.TeamInput {
  return {
    departmentId: Number(body.departmentId),
    code: stringOf(body, 'code'),
    nameZh: stringOf(body, 'nameZh'),
    nameEn: stringOf(body, 'nameEn') || null,
    status: statusOf(body),
  }
}

function userInputFrom(body: Record<string, unknown>): org.UserInput {
  return {
    email: stringOf(body, 'email'),
    nameZh: stringOf(body, 'nameZh'),
    nameEn: stringOf(body, 'nameEn') || null,
    phone: stringOf(body, 'phone') || null,
    role: stringOf(body, 'role'),
    companyId: body.companyId === undefined || body.companyId === null ? null : Number(body.companyId),
    status: statusOf(body),
    password: stringOf(body, 'password') || undefined,
  }
}

function userPatchFrom(body: Record<string, unknown>): Partial<org.UserInput> {
  const patch: Partial<org.UserInput> = {}
  if (body.email !== undefined) patch.email = stringOf(body, 'email')
  if (body.nameZh !== undefined) patch.nameZh = stringOf(body, 'nameZh')
  if (body.nameEn !== undefined) patch.nameEn = stringOf(body, 'nameEn') || null
  if (body.phone !== undefined) patch.phone = stringOf(body, 'phone') || null
  if (body.role !== undefined) patch.role = stringOf(body, 'role')
  if (body.companyId !== undefined) patch.companyId = body.companyId === null ? null : Number(body.companyId)
  if (body.status !== undefined) patch.status = statusOf(body)
  if (body.password !== undefined) patch.password = stringOf(body, 'password') || undefined
  return patch
}

/** Admin or the department's manager (contract §4 preamble). */
async function requireDepartmentMaintainer(
  c: Context<AppEnv>,
  db: DbClient,
  departmentId: number,
): Promise<SessionUser> {
  const user = requireSession(c)
  if (user.role === 'admin') return user
  if (user.role === 'manager' && (await isDepartmentManagerOf(db, user.id, departmentId))) return user
  throw forbidden(message(requestLocale(c), 'forbidden'))
}

/** Admin or the manager of the team's department. */
async function requireTeamMaintainer(c: Context<AppEnv>, db: DbClient, teamId: number): Promise<SessionUser> {
  const user = requireSession(c)
  if (user.role === 'admin') return user
  if (user.role === 'manager' && (await isTeamManagerOf(db, user.id, teamId))) return user
  throw forbidden(message(requestLocale(c), 'forbidden'))
}

/** Admin, the team's department manager, or a member of the team. */
async function requireTeamReader(c: Context<AppEnv>, db: DbClient, teamId: number): Promise<SessionUser> {
  const user = requireSession(c)
  if (user.role === 'admin') return user
  if (user.role === 'manager' && (await isTeamManagerOf(db, user.id, teamId))) return user
  const scope = await managerScope(db, user.id)
  if (scope.teamIds.includes(teamId)) return user
  throw forbidden(message(requestLocale(c), 'forbidden'))
}

export function registerOrgRoutes(app: Hono<AppEnv>, platform: Platform): void {
  const db = platform.db

  // --- Companies (§4.1) ---

  app.get('/api/org/companies', async (c) => {
    requireAdmin(c)
    return c.json(await org.listCompanies(db, c.req.query('q')))
  })

  // Registered before any /api/org/companies/:id pattern so the literal wins.
  app.get('/api/org/companies/export.csv', async (c) => {
    requireAdmin(c)
    return csvResponse(await org.exportCompaniesCsv(db))
  })

  app.post('/api/org/companies', async (c) => {
    const actor = requireAdmin(c)
    await org.createCompany(db, actor, companyInputFrom(await safeJsonBody(c)), requestLocale(c))
    return c.json({ ok: true })
  })

  app.patch('/api/org/companies/:id', async (c) => {
    const actor = requireAdmin(c)
    await org.updateCompany(db, actor, numericParam(c, 'id'), companyPatchFrom(await safeJsonBody(c)), requestLocale(c))
    return c.json({ ok: true })
  })

  app.post('/api/org/companies/import', async (c) => {
    const locale = requestLocale(c)
    const actor = requireAdmin(c)
    const body = await safeJsonBody(c)
    if (!Array.isArray(body.rows)) throw validation(message(locale, 'validation'), ['rows'])
    const applied = await org.importCompanies(db, actor, body.rows as org.CompanyImportRow[], locale)
    return c.json({ applied })
  })

  // --- Departments (§4.2) ---

  app.get('/api/org/departments', async (c) => {
    requireAdmin(c)
    return c.json(await org.listDepartments(db, pageParam(c), requestLocale(c)))
  })

  app.post('/api/org/departments', async (c) => {
    const actor = requireAdmin(c)
    await org.createDepartment(db, actor, departmentInputFrom(await safeJsonBody(c)), requestLocale(c))
    return c.json({ ok: true })
  })

  app.patch('/api/org/departments/:id', async (c) => {
    const actor = requireAdmin(c)
    await org.updateDepartment(db, actor, numericParam(c, 'id'), departmentPatchFrom(await safeJsonBody(c)), requestLocale(c))
    return c.json({ ok: true })
  })

  app.get('/api/org/departments/:id/teams', async (c) => {
    const departmentId = numericParam(c, 'id')
    await requireDepartmentMaintainer(c, db, departmentId)
    return c.json(await org.departmentTeams(db, departmentId, requestLocale(c)))
  })

  // --- Teams (§4.2) ---

  app.post('/api/org/teams', async (c) => {
    const locale = requestLocale(c)
    const body = await safeJsonBody(c)
    const departmentId = Number(body.departmentId)
    if (!Number.isInteger(departmentId) || departmentId <= 0) {
      throw validation(message(locale, 'validation'), ['departmentId'])
    }
    const actor = await requireDepartmentMaintainer(c, db, departmentId)
    await org.createTeam(db, actor, teamInputFrom(body), locale)
    return c.json({ ok: true })
  })

  app.patch('/api/org/teams/:id', async (c) => {
    const teamId = numericParam(c, 'id')
    const actor = await requireTeamMaintainer(c, db, teamId)
    const body = await safeJsonBody(c)
    const patch: { nameZh?: string; nameEn?: string | null } = {}
    if (body.nameZh !== undefined) patch.nameZh = stringOf(body, 'nameZh')
    if (body.nameEn !== undefined) patch.nameEn = stringOf(body, 'nameEn') || null
    await org.updateTeam(db, actor, teamId, patch, requestLocale(c))
    return c.json({ ok: true })
  })

  app.post('/api/org/teams/:id/status', async (c) => {
    const teamId = numericParam(c, 'id')
    const actor = await requireTeamMaintainer(c, db, teamId)
    const status = statusOf(await safeJsonBody(c))
    if (status === undefined) {
      throw validation(message(requestLocale(c), 'validation'), ['status'])
    }
    await org.setTeamStatus(db, actor, teamId, status, requestLocale(c))
    return c.json({ ok: true })
  })

  // --- Team members & candidate pools (§4.2) ---

  app.get('/api/org/teams/:id/members', async (c) => {
    const teamId = numericParam(c, 'id')
    await requireTeamReader(c, db, teamId)
    return c.json(await org.teamMembers(db, teamId, requestLocale(c)))
  })

  app.get('/api/org/teams/:id/member-candidates', async (c) => {
    const teamId = numericParam(c, 'id')
    await requireTeamReader(c, db, teamId)
    return c.json(await org.teamMemberCandidates(db, teamId, requestLocale(c)))
  })

  app.post('/api/org/teams/:id/members', async (c) => {
    const teamId = numericParam(c, 'id')
    await requireTeamMaintainer(c, db, teamId)
    const userId = Number((await safeJsonBody(c)).userId)
    if (!Number.isInteger(userId) || userId <= 0) {
      throw validation(message(requestLocale(c), 'validation'), ['userId'])
    }
    await org.addTeamMember(db, teamId, userId, requestLocale(c))
    return c.json({ ok: true })
  })

  app.delete('/api/org/teams/:id/members/:userId', async (c) => {
    const teamId = numericParam(c, 'id')
    const userId = numericParam(c, 'userId')
    await requireTeamMaintainer(c, db, teamId)
    await org.removeTeamMember(db, teamId, userId, requestLocale(c))
    return c.json({ ok: true })
  })

  // --- Department member candidates & direct members (§4.2) ---

  app.get('/api/org/departments/:id/member-candidates', async (c) => {
    requireAdmin(c)
    return c.json(await org.departmentMemberCandidates(db, numericParam(c, 'id'), requestLocale(c)))
  })

  app.post('/api/org/departments/:id/members', async (c) => {
    requireAdmin(c)
    const userId = Number((await safeJsonBody(c)).userId)
    if (!Number.isInteger(userId) || userId <= 0) {
      throw validation(message(requestLocale(c), 'validation'), ['userId'])
    }
    await org.addDepartmentMember(db, numericParam(c, 'id'), userId, requestLocale(c))
    return c.json({ ok: true })
  })

  // --- Vacations (§4.2) ---

  app.post('/api/org/teams/:teamId/members/:userId/vacations', async (c) => {
    const teamId = numericParam(c, 'teamId')
    const userId = numericParam(c, 'userId')
    const actor = await requireTeamMaintainer(c, db, teamId)
    const body = await safeJsonBody(c)
    await org.setVacation(
      db,
      teamId,
      userId,
      {
        startDate: stringOf(body, 'startDate'),
        endDate: stringOf(body, 'endDate'),
        autoReplyText: stringOf(body, 'autoReplyText') || undefined,
      },
      requestLocale(c),
    )
    return c.json({ ok: true })
  })

  app.delete('/api/org/teams/:teamId/members/:userId/vacations', async (c) => {
    const teamId = numericParam(c, 'teamId')
    const userId = numericParam(c, 'userId')
    await requireTeamMaintainer(c, db, teamId)
    await org.deleteVacation(db, teamId, userId, requestLocale(c))
    return c.json({ ok: true })
  })

  // --- Admin users (§4.3) ---

  app.get('/api/admin/users', async (c) => {
    requireAdmin(c)
    return c.json(await org.listUsers(db, pageParam(c), c.req.query('q'), requestLocale(c)))
  })

  // Registered before any /api/admin/users/:id pattern so the literal wins.
  app.get('/api/admin/users/export.csv', async (c) => {
    requireAdmin(c)
    return csvResponse(await org.exportUsersCsv(db))
  })

  app.post('/api/admin/users', async (c) => {
    const actor = requireAdmin(c)
    await org.createUser(db, actor, userInputFrom(await safeJsonBody(c)), requestLocale(c))
    return c.json({ ok: true })
  })

  app.patch('/api/admin/users/:id', async (c) => {
    const actor = requireAdmin(c)
    await org.updateUser(db, actor, numericParam(c, 'id'), userPatchFrom(await safeJsonBody(c)), requestLocale(c))
    return c.json({ ok: true })
  })

  app.post('/api/admin/users/import', async (c) => {
    const locale = requestLocale(c)
    const actor = requireAdmin(c)
    const body = await safeJsonBody(c)
    if (!Array.isArray(body.rows)) throw validation(message(locale, 'validation'), ['rows'])
    const applied = await org.importUsers(db, actor, body.rows as org.UserImportRow[], locale)
    return c.json({ applied })
  })
}
