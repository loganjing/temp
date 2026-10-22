import { randomUUID } from 'node:crypto'
import type { Hono } from 'hono'
import { AUDIT_ACTIONS, AUDIT_OBJECT_TYPES, ERROR_CODES, PERMISSIONS, type BusinessGroup, type OrgMember } from '../../shared/contracts'
import {
  FieldCollector,
  apiError,
  booleanQuery,
  conflict,
  handler,
  notFound,
  queryString,
  readJsonObject,
  stringArrayField,
  stringField,
} from '../platform/http'
import { authorizedActor, type Platform } from './support'

export function registerOrgRoutes(app: Hono, platform: Platform): void {
  const assertMembersInCompany = async (companyId: string, memberIds: readonly string[]): Promise<void> => {
    if (memberIds.length === 0) return
    const valid = await platform.identity.memberIdsInCompany(companyId, memberIds)
    if (valid.size !== memberIds.length) {
      throw apiError(400, ERROR_CODES.INVALID_REQUEST, 'Invalid request', { fields: { memberIds: 'must reference members of the current company' } })
    }
  }

  const loadGroup = async (companyId: string, groupId: string): Promise<BusinessGroup> => {
    const group = await platform.org.findGroup(companyId, groupId)
    if (!group) throw notFound()
    const members = await platform.org.groupMembers(groupId)
    return { id: group.id, name: group.name, description: group.description, members, createdAt: group.createdAt, updatedAt: group.updatedAt }
  }

  app.get('/api/org/groups', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.ORG_READ)
    return context.json({ items: await platform.org.listGroups(actor.member.companyId) })
  }))

  app.post('/api/org/groups', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.ORG_CONFIGURE)
    const companyId = actor.member.companyId
    const body = await readJsonObject(context)
    const collector = new FieldCollector()
    const name = stringField(collector, 'name', body.name, { max: 100 })
    const description = stringField(collector, 'description', body.description, { max: 500, optional: true, min: 0 })
    const memberIds = body.memberIds === undefined ? [] : stringArrayField(collector, 'memberIds', body.memberIds)
    collector.assertEmpty()
    const ids = memberIds as string[]
    await assertMembersInCompany(companyId, ids)
    if (await platform.org.findGroupByName(companyId, name as string)) throw conflict('A business group with this name already exists')
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    await platform.db.transaction(async (tx) => {
      await platform.org.insertGroup({ id, companyId, name: name as string, description, createdAt: timestamp }, tx)
      await platform.org.replaceGroupMembers(id, ids, tx)
    })
    await platform.audit.record({
      action: AUDIT_ACTIONS.GROUP_CREATED,
      actorMemberId: actor.member.memberId,
      objectType: AUDIT_OBJECT_TYPES.BUSINESS_GROUP,
      objectId: id,
      companyId,
      details: { name, memberCount: ids.length },
    })
    return context.json({ group: await loadGroup(companyId, id) }, 201)
  }))

  app.patch('/api/org/groups/:id', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.ORG_CONFIGURE)
    const companyId = actor.member.companyId
    const groupId = context.req.param('id') ?? ''
    const existing = await platform.org.findGroup(companyId, groupId)
    if (!existing) throw notFound()
    const body = await readJsonObject(context)
    const collector = new FieldCollector()
    const name = body.name === undefined ? null : stringField(collector, 'name', body.name, { max: 100 })
    const description = body.description === undefined ? existing.description : stringField(collector, 'description', body.description, { max: 500, optional: true, min: 0 })
    collector.assertEmpty()
    const nextName = name ?? existing.name
    if (nextName !== existing.name) {
      const clash = await platform.org.findGroupByName(companyId, nextName)
      if (clash && clash.id !== groupId) throw conflict('A business group with this name already exists')
    }
    await platform.org.updateGroup(groupId, { name: nextName, description, updatedAt: new Date().toISOString() })
    await platform.audit.record({
      action: AUDIT_ACTIONS.GROUP_UPDATED,
      actorMemberId: actor.member.memberId,
      objectType: AUDIT_OBJECT_TYPES.BUSINESS_GROUP,
      objectId: groupId,
      companyId,
      details: { name: nextName },
    })
    return context.json({ group: await loadGroup(companyId, groupId) })
  }))

  app.put('/api/org/groups/:id/members', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.ORG_CONFIGURE)
    const companyId = actor.member.companyId
    const groupId = context.req.param('id') ?? ''
    if (!await platform.org.findGroup(companyId, groupId)) throw notFound()
    const body = await readJsonObject(context)
    const collector = new FieldCollector()
    const memberIds = stringArrayField(collector, 'memberIds', body.memberIds)
    collector.assertEmpty()
    const ids = memberIds as string[]
    await assertMembersInCompany(companyId, ids)
    await platform.org.replaceGroupMembers(groupId, ids)
    await platform.audit.record({
      action: AUDIT_ACTIONS.GROUP_MEMBERS_UPDATED,
      actorMemberId: actor.member.memberId,
      objectType: AUDIT_OBJECT_TYPES.BUSINESS_GROUP,
      objectId: groupId,
      companyId,
      details: { memberCount: ids.length },
    })
    return context.json({ group: await loadGroup(companyId, groupId) })
  }))

  app.get('/api/org/assignment-rules', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.ORG_READ)
    return context.json({ items: await platform.org.listRules(actor.member.companyId) })
  }))

  app.post('/api/org/assignment-rules', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.ORG_CONFIGURE)
    const companyId = actor.member.companyId
    const body = await readJsonObject(context)
    const collector = new FieldCollector()
    const category = stringField(collector, 'category', body.category, { max: 50 })
    const groupId = stringField(collector, 'groupId', body.groupId, { max: 200 })
    collector.assertEmpty()
    const group = await platform.org.findGroup(companyId, groupId as string)
    if (!group) throw notFound()
    if (await platform.org.findRuleByCategory(companyId, category as string)) throw conflict('An assignment rule for this category already exists')
    const id = randomUUID()
    await platform.org.insertRule({ id, companyId, category: category as string, groupId: group.id, createdAt: new Date().toISOString() })
    await platform.audit.record({
      action: AUDIT_ACTIONS.ASSIGNMENT_RULE_CREATED,
      actorMemberId: actor.member.memberId,
      objectType: AUDIT_OBJECT_TYPES.ASSIGNMENT_RULE,
      objectId: id,
      companyId,
      details: { category, groupId: group.id },
    })
    return context.json({ rule: await platform.org.findRule(companyId, id) }, 201)
  }))

  app.patch('/api/org/assignment-rules/:id', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.ORG_CONFIGURE)
    const companyId = actor.member.companyId
    const ruleId = context.req.param('id') ?? ''
    const existing = await platform.org.findRule(companyId, ruleId)
    if (!existing) throw notFound()
    const body = await readJsonObject(context)
    const collector = new FieldCollector()
    const category = body.category === undefined ? null : stringField(collector, 'category', body.category, { max: 50 })
    const groupId = body.groupId === undefined ? null : stringField(collector, 'groupId', body.groupId, { max: 200 })
    collector.assertEmpty()
    if (groupId && !await platform.org.findGroup(companyId, groupId)) throw notFound()
    const nextCategory = category ?? existing.category
    const nextGroupId = groupId ?? existing.groupId
    if (nextCategory !== existing.category) {
      const clash = await platform.org.findRuleByCategory(companyId, nextCategory)
      if (clash && clash.id !== ruleId) throw conflict('An assignment rule for this category already exists')
    }
    await platform.org.updateRule(ruleId, { category: nextCategory, groupId: nextGroupId, updatedAt: new Date().toISOString() })
    await platform.audit.record({
      action: AUDIT_ACTIONS.ASSIGNMENT_RULE_UPDATED,
      actorMemberId: actor.member.memberId,
      objectType: AUDIT_OBJECT_TYPES.ASSIGNMENT_RULE,
      objectId: ruleId,
      companyId,
      details: { category: nextCategory, groupId: nextGroupId },
    })
    return context.json({ rule: await platform.org.findRule(companyId, ruleId) })
  }))

  app.delete('/api/org/assignment-rules/:id', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.ORG_CONFIGURE)
    const companyId = actor.member.companyId
    const ruleId = context.req.param('id') ?? ''
    if (!await platform.org.findRule(companyId, ruleId)) throw notFound()
    await platform.org.deleteRule(ruleId)
    await platform.audit.record({
      action: AUDIT_ACTIONS.ASSIGNMENT_RULE_DELETED,
      actorMemberId: actor.member.memberId,
      objectType: AUDIT_OBJECT_TYPES.ASSIGNMENT_RULE,
      objectId: ruleId,
      companyId,
    })
    return context.json({ deleted: true })
  }))

  app.get('/api/org/members', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.ORG_READ)
    const collector = new FieldCollector()
    const activeOnly = booleanQuery(collector, context, 'activeOnly', true)
    const search = queryString(context, 'q')
    collector.assertEmpty()
    const rows = await platform.identity.listCompanyMembers(actor.member.companyId, { activeOnly, search })
    const items: OrgMember[] = rows.map((row) => ({
      memberId: row.memberId,
      displayName: row.displayName,
      email: row.email,
      departmentId: row.departmentId,
      departmentName: row.departmentName,
      roles: row.roles,
    }))
    return context.json({ items })
  }))
}
