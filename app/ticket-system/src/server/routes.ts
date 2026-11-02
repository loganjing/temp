import { randomUUID } from 'node:crypto'
import type { Context, Hono, MiddlewareHandler } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { AuthUser } from '@commonapp/userkit'
import { loadProfile, requireProfile } from './services/access'
import {
  addGroupMember,
  createAssignmentRule,
  createGroup,
  deleteAssignmentRule,
  deleteGroup,
  listAssignmentRules,
  listCategories,
  listCompanies,
  listDepartments,
  listGroups,
  removeGroupMember,
  renameGroup,
  updateAssignmentRule,
} from './services/config'
import { getDashboard, getDistribution } from './services/stats'
import {
  addReply,
  assignTicket,
  cancelTicket,
  changePriority,
  completeTicket,
  createTicket,
  getSubmitterContext,
  getTicketDetail,
  listEvents,
  listReplies,
  listTicketNotifications,
  listTickets,
  rateTicket,
  resendTicketNotification,
  transferTicket,
} from './services/tickets'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
const errorBody = (code: string, message: string) => ({ error: { code, message } })
const currentUser = (context: Context) => context.get('currentUser' as never) as unknown as AuthUser
const currentUserId = (context: unknown) => ((context as { get(name: string): unknown }).get('currentUser') as AuthUser).id
const requestBody = async (context: Context) => (await context.req.json().catch(() => ({}))) as Record<string, unknown>
const profileFor = (context: Context, platform: Platform) => requireProfile(platform.db, currentUser(context).id)
const requiredString = (value: unknown, name: string, maxLength = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw new TypeError(`${name} is required`)
  return value.trim()
}
const userMutationError = (error: unknown, fallback: string) => {
  if (error instanceof TypeError) return error.message
  if (error instanceof Error && /unique constraint/i.test(error.message)) return 'Email or phone is already in use'
  console.error('[users] mutation failed')
  return fallback
}

export function registerPublicRoutes(app: Hono, platform: Platform) {
  app.get('/api/auth/bootstrap-status', async (context) => context.json({ required: (await platform.auth.userStore.count()) === 0 }))
  app.post('/api/auth/bootstrap', platform.auth.loginRateLimit, async (context) => {
    const body = await context.req.json().catch(() => ({}))
    let name: string
    let email: string
    let password: string
    try {
      name = requiredString(body.name, 'name')
      email = requiredString(body.email, 'email', 320).toLowerCase()
      password = requiredString(body.password, 'password', 256)
      if (!email.includes('@') || password.length < 12) throw new TypeError('Enter a valid email and a password with at least 12 characters')
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
    const passwordHash = platform.auth.hashPassword(password)
    const id = randomUUID()
    try {
      await platform.db.transaction(async (tx) => {
        const count = await tx.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM users' })
        if (Number(count?.total ?? 0) !== 0) throw new Error('BOOTSTRAP_CLOSED')
        const timestamp = new Date().toISOString()
        await tx.run({
          text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, NULL, ?, ?, ?)',
          params: [id, name, email, passwordHash, timestamp, timestamp],
        })
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'BOOTSTRAP_CLOSED') return context.json(errorBody('BOOTSTRAP_CLOSED', 'An account already exists'), 409)
      console.error('[bootstrap] failed')
      return context.json(errorBody('BOOTSTRAP_FAILED', 'Could not create the first account'), 500)
    }
    return context.json({ ok: true }, 201)
  })
  app.post('/api/auth/login', platform.auth.normalizeLogin, platform.auth.loginRateLimit, platform.auth.loginRoute as MiddlewareHandler)
  app.get('/api/auth/sso/start', (context) => platform.auth.sso.start(context as never))
  app.get('/api/auth/sso/callback', (context) => platform.auth.sso.callback(context as never))
  app.post('/api/auth/sso/exchange', (context) => platform.auth.sso.exchange(context as never))
}

export function registerProtectedRoutes(app: Hono, platform: Platform) {
  app.get('/api/auth/me', async (context) => {
    const user = currentUser(context)
    const profile = await loadProfile(platform.db, user.id)
    return context.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: profile?.role ?? user.role,
      companyId: profile?.companyId ?? user.companyId,
      companyName: profile?.companyName ?? null,
      departmentId: profile?.departmentId ?? null,
      departmentName: profile?.departmentName ?? null,
      roles: profile ? [profile.role] : user.roles,
      passwordChangeRequired: user.passwordChangeRequired,
    })
  })
  app.post('/api/auth/password', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    let password: string
    try {
      password = requiredString(body.password, 'password', 256)
      if (password.length < 12) throw new TypeError('Password must contain at least 12 characters')
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid password'), 400)
    }
    const userId = currentUserId(context)
    if (!await platform.auth.userStore.updatePassword(userId, platform.auth.hashPassword(password))) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    return context.json({ ok: true, passwordChangeRequired: false })
  })

  app.get('/api/tickets', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await listTickets(platform.db, profile, context.req.query()))
  })

  app.post('/api/tickets', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await createTicket(platform.db, profile, await requestBody(context)), 201)
  })

  app.get('/api/tickets/:ticketId', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await getTicketDetail(platform.db, profile, context.req.param('ticketId')))
  })

  app.get('/api/tickets/:ticketId/submitter', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await getSubmitterContext(platform.db, profile, context.req.param('ticketId')))
  })

  app.get('/api/tickets/:ticketId/replies', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await listReplies(platform.db, profile, context.req.param('ticketId')))
  })

  app.post('/api/tickets/:ticketId/replies', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await addReply(platform.db, profile, context.req.param('ticketId'), await requestBody(context)), 201)
  })

  app.post('/api/tickets/:ticketId/assign', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await assignTicket(platform.db, profile, context.req.param('ticketId'), await requestBody(context)))
  })

  app.post('/api/tickets/:ticketId/transfer', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await transferTicket(platform.db, profile, context.req.param('ticketId'), await requestBody(context)))
  })

  app.post('/api/tickets/:ticketId/complete', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await completeTicket(platform.db, platform.email, profile, context.req.param('ticketId')))
  })

  app.post('/api/tickets/:ticketId/cancel', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await cancelTicket(platform.db, profile, context.req.param('ticketId')))
  })

  app.patch('/api/tickets/:ticketId/priority', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await changePriority(platform.db, profile, context.req.param('ticketId'), await requestBody(context)))
  })

  app.post('/api/tickets/:ticketId/rating', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await rateTicket(platform.db, profile, context.req.param('ticketId'), await requestBody(context)))
  })

  app.get('/api/tickets/:ticketId/events', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await listEvents(platform.db, profile, context.req.param('ticketId')))
  })

  app.get('/api/tickets/:ticketId/notifications', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await listTicketNotifications(platform.db, profile, context.req.param('ticketId')))
  })

  app.post('/api/tickets/:ticketId/notifications/:notificationId/resend', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await resendTicketNotification(
      platform.db,
      platform.email,
      profile,
      context.req.param('ticketId'),
      context.req.param('notificationId'),
    ))
  })

  app.get('/api/groups', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await listGroups(platform.db, profile))
  })

  app.post('/api/groups', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await createGroup(platform.db, profile, await requestBody(context)), 201)
  })

  app.patch('/api/groups/:groupId', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await renameGroup(platform.db, profile, context.req.param('groupId'), await requestBody(context)))
  })

  app.delete('/api/groups/:groupId', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await deleteGroup(platform.db, profile, context.req.param('groupId')))
  })

  app.post('/api/groups/:groupId/members', async (context) => {
    const profile = await profileFor(context, platform)
    const result = await addGroupMember(platform.db, profile, context.req.param('groupId'), await requestBody(context))
    return context.json({ member: result.member, groupId: result.groupId }, result.created ? 201 : 200)
  })

  app.delete('/api/groups/:groupId/members/:userId', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await removeGroupMember(platform.db, profile, context.req.param('groupId'), context.req.param('userId')))
  })

  app.get('/api/categories', async (context) => {
    await profileFor(context, platform)
    return context.json(await listCategories(platform.db))
  })

  app.get('/api/assignment-rules', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await listAssignmentRules(platform.db, profile))
  })

  app.post('/api/assignment-rules', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await createAssignmentRule(platform.db, profile, await requestBody(context)), 201)
  })

  app.put('/api/assignment-rules/:ruleId', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await updateAssignmentRule(platform.db, profile, context.req.param('ruleId'), await requestBody(context)))
  })

  app.delete('/api/assignment-rules/:ruleId', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await deleteAssignmentRule(platform.db, profile, context.req.param('ruleId')))
  })

  app.get('/api/stats/distribution', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await getDistribution(platform.db, profile, context.req.query()))
  })

  app.get('/api/stats/dashboard', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await getDashboard(platform.db, profile, context.req.query()))
  })

  app.get('/api/meta/companies', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await listCompanies(platform.db, profile))
  })

  app.get('/api/meta/departments', async (context) => {
    const profile = await profileFor(context, platform)
    return context.json(await listDepartments(platform.db, profile, context.req.query('companyId')))
  })

  app.get('/api/admin/users', async (context) => {
    const search = context.req.query('search') ?? ''
    const limit = Math.min(Math.max(Number(context.req.query('limit') ?? 50), 1), 100)
    const offset = Math.max(Number(context.req.query('offset') ?? 0), 0)
    const [users, total] = await Promise.all([
      platform.auth.userStore.list({ search, limit, offset }),
      platform.auth.userStore.count({ search }),
    ])
    return context.json({ users, total })
  })

  app.post('/api/admin/users', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    try {
      const name = requiredString(body.name, 'name')
      const email = requiredString(body.email, 'email', 320).toLowerCase()
      const password = requiredString(body.password, 'password', 256)
      if (!email.includes('@') || password.length < 12) throw new TypeError('Enter a valid email and a password with at least 12 characters')
      const user = await platform.auth.userStore.create({ name, email, phone: typeof body.phone === 'string' ? body.phone : null, passwordChangeRequired: true }, platform.auth.hashPassword(password))
      return context.json({ user }, 201)
    } catch (error) {
      return context.json(errorBody('INVALID_USER', userMutationError(error, 'Could not create user')), error instanceof TypeError ? 400 : 409)
    }
  })

  app.patch('/api/admin/users/:id', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    try {
      const email = requiredString(body.email, 'email', 320).toLowerCase()
      if (!email.includes('@')) throw new TypeError('Enter a valid email address')
      const user = await platform.auth.userStore.update(context.req.param('id'), {
        name: requiredString(body.name, 'name'),
        email,
        phone: typeof body.phone === 'string' ? body.phone : null,
      })
      if (!user) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
      return context.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone } })
    } catch (error) {
      return context.json(errorBody('INVALID_USER', userMutationError(error, 'Could not update user')), error instanceof TypeError ? 400 : 409)
    }
  })

  app.patch('/api/admin/users/:id/status', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    if (typeof body.enabled !== 'boolean') return context.json(errorBody('INVALID_INPUT', 'enabled must be a boolean'), 400)
    const userId = context.req.param('id')
    const changed = await platform.db.transaction(async (tx) => {
      const result = await tx.run({ text: 'UPDATE users SET enabled = ?, updated_at = ? WHERE id = ?', params: [body.enabled ? 1 : 0, new Date().toISOString(), userId] })
      return result.changes === 1
    })
    if (!changed) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    return context.json({ ok: true })
  })

  app.post('/api/admin/users/:id/password', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    let password: string
    try {
      password = requiredString(body.password, 'password', 256)
      if (password.length < 12) throw new TypeError('Password must contain at least 12 characters')
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid password'), 400)
    }
    const userId = context.req.param('id')
    const changed = await platform.auth.userStore.updatePassword(userId, platform.auth.hashPassword(password), true)
    if (!changed) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    return context.json({ ok: true })
  })
}