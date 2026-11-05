import type { Hono } from 'hono'
import { requireBoolean, requireText, throwIfInvalid, validationFailed } from '../errors'
import type { IdentityService } from '../services/identity'
import type { OrgService } from '../services/org'
import { currentIdentity, jsonBody } from './helpers'

export function registerOrgRoutes(app: Hono, identityService: IdentityService, org: OrgService) {
  app.get('/api/reference', async (context) => {
    const actor = await currentIdentity(context, identityService)
    return context.json(await org.listReference(actor.companyId))
  })

  app.get('/api/business-groups', async (context) => {
    const actor = await currentIdentity(context, identityService)
    identityService.requireCompanyAdmin(actor)
    return context.json({ items: await org.listGroups(actor.companyId) })
  })

  app.post('/api/business-groups', async (context) => {
    const actor = await currentIdentity(context, identityService)
    identityService.requireCompanyAdmin(actor)
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const name = requireText(body.name, 'name', '业务组名称', 60, errors)
    const description = requireText(body.description, 'description', '业务组说明', 200, errors, { required: false })
    throwIfInvalid(errors)
    return context.json({ group: await org.createGroup(actor.companyId, { name: name!, description }) }, 201)
  })

  app.patch('/api/business-groups/:id', async (context) => {
    const actor = await currentIdentity(context, identityService)
    identityService.requireCompanyAdmin(actor)
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const name = requireText(body.name, 'name', '业务组名称', 60, errors, { required: false })
    const description = requireText(body.description, 'description', '业务组说明', 200, errors, { required: false })
    const enabled = body.enabled === undefined ? undefined : requireBoolean(body.enabled, 'enabled', '启用状态', errors)
    throwIfInvalid(errors)
    if (name === undefined && description === undefined && enabled === undefined) {
      throw validationFailed('提交内容有误，请检查后重试', { name: '至少需要修改一个字段' })
    }
    return context.json({ group: await org.updateGroup(actor.companyId, context.req.param('id'), { name, description, enabled }) })
  })

  app.post('/api/business-groups/:id/members', async (context) => {
    const actor = await currentIdentity(context, identityService)
    identityService.requireCompanyAdmin(actor)
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const userId = requireText(body.userId, 'userId', '用户', 100, errors)
    throwIfInvalid(errors)
    return context.json({ member: await org.addGroupMember(actor.companyId, context.req.param('id'), userId!) }, 201)
  })

  app.delete('/api/business-groups/:id/members/:userId', async (context) => {
    const actor = await currentIdentity(context, identityService)
    identityService.requireCompanyAdmin(actor)
    await org.removeGroupMember(actor.companyId, context.req.param('id'), context.req.param('userId'))
    return context.body(null, 204)
  })

  app.get('/api/ticket-categories', async (context) => {
    const actor = await currentIdentity(context, identityService)
    identityService.requireCompanyAdmin(actor)
    return context.json({ items: await org.listCategories(actor.companyId) })
  })

  app.post('/api/ticket-categories', async (context) => {
    const actor = await currentIdentity(context, identityService)
    identityService.requireCompanyAdmin(actor)
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const name = requireText(body.name, 'name', '分类名称', 40, errors)
    const sortOrder = body.sortOrder === undefined ? undefined : Number(body.sortOrder)
    if (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 0)) errors.sortOrder = '排序值必须是非负整数'
    throwIfInvalid(errors)
    return context.json({ category: await org.createCategory(actor.companyId, { name: name!, sortOrder }) }, 201)
  })

  app.patch('/api/ticket-categories/:id', async (context) => {
    const actor = await currentIdentity(context, identityService)
    identityService.requireCompanyAdmin(actor)
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const name = requireText(body.name, 'name', '分类名称', 40, errors, { required: false })
    const enabled = body.enabled === undefined ? undefined : requireBoolean(body.enabled, 'enabled', '启用状态', errors)
    const sortOrder = body.sortOrder === undefined ? undefined : Number(body.sortOrder)
    if (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 0)) errors.sortOrder = '排序值必须是非负整数'
    throwIfInvalid(errors)
    if (name === undefined && enabled === undefined && sortOrder === undefined) {
      throw validationFailed('提交内容有误，请检查后重试', { name: '至少需要修改一个字段' })
    }
    return context.json({ category: await org.updateCategory(actor.companyId, context.req.param('id'), { name, enabled, sortOrder }) })
  })

  app.get('/api/assignment-rules', async (context) => {
    const actor = await currentIdentity(context, identityService)
    identityService.requireCompanyAdmin(actor)
    return context.json({ items: await org.listRules(actor.companyId) })
  })

  app.put('/api/assignment-rules', async (context) => {
    const actor = await currentIdentity(context, identityService)
    identityService.requireCompanyAdmin(actor)
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const categoryId = requireText(body.categoryId, 'categoryId', '分类', 100, errors)
    const groupId = requireText(body.groupId, 'groupId', '业务组', 100, errors)
    const enabled = requireBoolean(body.enabled, 'enabled', '启用状态', errors)
    throwIfInvalid(errors)
    return context.json({ rule: await org.upsertRule(actor.companyId, { categoryId: categoryId!, groupId: groupId!, enabled: enabled! }) })
  })
}
