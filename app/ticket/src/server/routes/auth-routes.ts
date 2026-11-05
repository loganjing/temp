import type { Context, Hono } from 'hono'
import { ApiError, accountDisabled, forbidden, requireBoolean, requireText, throwIfInvalid, validationFailed } from '../errors'
import type { IdentityService } from '../services/identity'
import type { initializePlatform } from '../platform/bootstrap'
import { currentAuthUser, currentIdentity, jsonBody } from './helpers'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

export function registerAuthRoutes(app: Hono, platform: Platform, identityService: IdentityService) {
  app.post('/api/auth/login', platform.auth.loginRateLimit, async (context) => {
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const email = requireText(body.email, 'email', '邮箱', 320, errors)
    const password = typeof body.password === 'string' ? body.password : ''
    if (!password) errors.password = '密码不能为空'
    throwIfInvalid(errors)

    const user = await platform.auth.userStore.findByField('email', email!)
    if (!user || !platform.auth.verifyPassword(password, user.passwordHash)) {
      throw new ApiError(401, 'UNAUTHENTICATED', '邮箱或密码不正确')
    }
    if (!user.enabled) throw accountDisabled()
    const identity = await identityService.getById(user.id)
    if (!identity) throw forbidden('账号未分配公司或部门，请联系管理员')
    const token = platform.auth.signToken(user.id)
    return context.json({
      token,
      user: { ...identityService.toProfile(identity), passwordChangeRequired: Boolean(user.passwordChangeRequired) },
    })
  })
}

export function registerIdentityRoutes(app: Hono, platform: Platform, identityService: IdentityService) {
  const me = async (context: Context) => {
    const identity = await currentIdentity(context, identityService)
    const user = currentAuthUser(context)
    return context.json({ ...identityService.toProfile(identity), passwordChangeRequired: Boolean(user.passwordChangeRequired) })
  }
  app.get('/api/me', me)
  app.get('/api/auth/me', me)

  app.post('/api/auth/password', async (context) => {
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const password = requireText(body.password, 'password', '新密码', 256, errors)
    if (password && password.length < 12) errors.password = '密码至少需要12个字符'
    throwIfInvalid(errors)
    const user = currentAuthUser(context)
    const changed = await platform.auth.userStore.updatePassword(user.id, platform.auth.hashPassword(password!), false)
    if (!changed) return context.json({ error: { code: 'NOT_FOUND', message: '用户不存在' } }, 404)
    return context.json({ ok: true, passwordChangeRequired: false })
  })

  app.get('/api/company-users', async (context) => {
    const identity = await currentIdentity(context, identityService)
    identityService.requireCompanyAdmin(identity)
    const records = await identityService.listCompanyUserRecords(identity.companyId, context.req.query('q') ?? '')
    return context.json({
      items: records.map(({ phone: _phone, ...user }) => user),
    })
  })

  app.patch('/api/company-users/:id', async (context) => {
    const actor = await currentIdentity(context, identityService)
    identityService.requireCompanyAdmin(actor)
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const department = requireText(body.department, 'department', '部门', 60, errors, { required: false })
    const enabled = body.enabled === undefined ? undefined : requireBoolean(body.enabled, 'enabled', '启用状态', errors)
    throwIfInvalid(errors)
    if (department === undefined && enabled === undefined) {
      throw validationFailed('提交内容有误，请检查后重试', { department: '至少需要修改一个字段' })
    }
    const user = await identityService.updateCompanyUser(actor.companyId, context.req.param('id'), { department, enabled })
    const { phone: _phone, ...rest } = user
    return context.json({ user: rest })
  })

  // 脚手架自带的用户管理接口按 D2 收口：仅公司管理员可用，且读写限制在本公司用户。
  app.get('/api/admin/users', async (context) => {
    const actor = await currentIdentity(context, identityService)
    identityService.requireCompanyAdmin(actor)
    const search = context.req.query('search') ?? ''
    const limit = Math.min(Math.max(Number(context.req.query('limit') ?? 50), 1), 100)
    const offset = Math.max(Number(context.req.query('offset') ?? 0), 0)
    const records = await identityService.listCompanyUserRecords(actor.companyId, search)
    return context.json({
      users: records.slice(offset, offset + limit).map((record) => ({
        id: record.id,
        name: record.name,
        email: record.email,
        phone: record.phone,
        enabled: record.enabled,
        department: record.department,
        roles: record.roles,
        groups: record.groups,
      })),
      total: records.length,
    })
  })

  app.post('/api/admin/users', async (context) => {
    const actor = await currentIdentity(context, identityService)
    identityService.requireCompanyAdmin(actor)
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const name = requireText(body.name, 'name', '姓名', 200, errors)
    const email = requireText(body.email, 'email', '邮箱', 320, errors)
    const password = requireText(body.password, 'password', '临时密码', 256, errors)
    const department = requireText(body.department, 'department', '部门', 60, errors, { required: false }) ?? '未分配'
    if (email && !email.includes('@')) errors.email = '请输入有效的邮箱地址'
    if (password && password.length < 12) errors.password = '密码至少需要12个字符'
    throwIfInvalid(errors)
    try {
      const user = await platform.auth.userStore.create(
        {
          name: name!,
          email: email!,
          phone: typeof body.phone === 'string' ? body.phone : null,
          companyId: actor.companyId,
          passwordChangeRequired: true,
        },
        platform.auth.hashPassword(password!),
      )
      await identityService.createProfile(actor.companyId, user.id, department)
      return context.json({ user: { ...user, department } }, 201)
    } catch (error) {
      if (error instanceof Error && /unique constraint/i.test(error.message)) {
        throw validationFailed('提交内容有误，请检查后重试', { email: '该邮箱已被使用' })
      }
      throw error
    }
  })

  app.patch('/api/admin/users/:id', async (context) => {
    const actor = await currentIdentity(context, identityService)
    identityService.requireCompanyAdmin(actor)
    const target = await identityService.getCompanyUserRecord(actor.companyId, context.req.param('id'))
    if (!target) {
      const elsewhere = await platform.db.queryOne({ text: 'SELECT user_id FROM user_profiles WHERE user_id = ?', params: [context.req.param('id')] })
      if (elsewhere) throw forbidden('不能修改其他公司的用户')
      return context.json({ error: { code: 'NOT_FOUND', message: '用户不存在' } }, 404)
    }
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const name = requireText(body.name, 'name', '姓名', 200, errors)
    const email = requireText(body.email, 'email', '邮箱', 320, errors)
    const department = requireText(body.department, 'department', '部门', 60, errors, { required: false })
    if (email && !email.includes('@')) errors.email = '请输入有效的邮箱地址'
    throwIfInvalid(errors)
    try {
      const user = await platform.auth.userStore.update(target.id, {
        name: name!,
        email: email!,
        phone: typeof body.phone === 'string' ? body.phone : null,
      })
      if (!user) return context.json({ error: { code: 'NOT_FOUND', message: '用户不存在' } }, 404)
      if (department !== undefined) await identityService.updateCompanyUser(actor.companyId, target.id, { department })
      return context.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, department: department ?? target.department } })
    } catch (error) {
      if (error instanceof Error && /unique constraint/i.test(error.message)) {
        throw validationFailed('提交内容有误，请检查后重试', { email: '该邮箱已被使用' })
      }
      throw error
    }
  })

  app.patch('/api/admin/users/:id/status', async (context) => {
    const actor = await currentIdentity(context, identityService)
    identityService.requireCompanyAdmin(actor)
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const enabled = requireBoolean(body.enabled, 'enabled', '启用状态', errors)
    throwIfInvalid(errors)
    const target = await identityService.getCompanyUserRecord(actor.companyId, context.req.param('id'))
    if (!target) {
      const elsewhere = await platform.db.queryOne({ text: 'SELECT user_id FROM user_profiles WHERE user_id = ?', params: [context.req.param('id')] })
      if (elsewhere) throw forbidden('不能修改其他公司的用户')
      return context.json({ error: { code: 'NOT_FOUND', message: '用户不存在' } }, 404)
    }
    await platform.auth.userStore.setEnabled(target.id, enabled!)
    return context.json({ ok: true })
  })

  app.post('/api/admin/users/:id/password', async (context) => {
    const actor = await currentIdentity(context, identityService)
    identityService.requireCompanyAdmin(actor)
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const password = requireText(body.password, 'password', '新密码', 256, errors)
    if (password && password.length < 12) errors.password = '密码至少需要12个字符'
    throwIfInvalid(errors)
    const target = await identityService.getCompanyUserRecord(actor.companyId, context.req.param('id'))
    if (!target) {
      const elsewhere = await platform.db.queryOne({ text: 'SELECT user_id FROM user_profiles WHERE user_id = ?', params: [context.req.param('id')] })
      if (elsewhere) throw forbidden('不能修改其他公司的用户')
      return context.json({ error: { code: 'NOT_FOUND', message: '用户不存在' } }, 404)
    }
    await platform.auth.userStore.updatePassword(target.id, platform.auth.hashPassword(password!), true)
    return context.json({ ok: true })
  })
}
