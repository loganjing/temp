import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import { apiError } from '../api-error'
import { newId } from '../ids'
import { readJson, requireString } from '../request'
import { findGroupById, requireCompany, requireGroup, requireUser } from './organizations'
import { requireTicket, requireTicketRow } from './ticket-store'

// assignment：自动分配规则维护；创建工单时的规则匹配与分配执行（架构基线 2.2）。
// 独占 assignment_rules 表；tickets.assigned_group_id / status 的分配结果由本模块写入。

export interface AssignmentRuleRow {
  id: string
  company_id: string
  category: string
  group_id: string
  created_at: string
}

/** 创建工单同一事务内调用：按公司内分类精确文本匹配规则。 */
export async function findRuleForCategory(db: DbClient, companyId: string, category: string): Promise<AssignmentRuleRow | null> {
  return db.queryOne<AssignmentRuleRow>({
    text: 'SELECT id, company_id, category, group_id, created_at FROM assignment_rules WHERE company_id = ? AND category = ?',
    params: [companyId, category],
  })
}

export function registerAssignmentRoutes(app: Hono, db: DbClient) {
  app.get('/api/companies/:id/assignment-rules', async (c) => {
    const company = await requireCompany(db, c.req.param('id'))
    const rules = await db.queryAll<AssignmentRuleRow>({
      text: 'SELECT id, company_id, category, group_id, created_at FROM assignment_rules WHERE company_id = ? ORDER BY created_at',
      params: [company.id],
    })
    const groups = await Promise.all(rules.map((rule) => findGroupById(db, rule.group_id)))
    return c.json({
      rules: rules.map((rule, index) => ({
        id: rule.id,
        category: rule.category,
        groupId: rule.group_id,
        groupName: groups[index]?.name ?? '',
      })),
    })
  })

  app.post('/api/companies/:id/assignment-rules', async (c) => {
    const body = await readJson(c)
    const category = requireString(body, 'category')
    const groupId = requireString(body, 'groupId')
    const company = await requireCompany(db, c.req.param('id'))
    const group = await requireGroup(db, groupId)
    if (group.company_id !== company.id) throw apiError.validation('分配规则业务组须属于该公司')
    if (await findRuleForCategory(db, company.id, category)) throw apiError.conflict('该公司该分类的分配规则已存在')
    const id = newId()
    const createdAt = new Date().toISOString()
    await db.run({
      text: 'INSERT INTO assignment_rules (id, company_id, category, group_id, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [id, company.id, category, group.id, createdAt],
    })
    return c.json({ id, companyId: company.id, category, groupId: group.id, createdAt }, 201)
  })

  app.post('/api/tickets/:id/assign', async (c) => {
    const body = await readJson(c)
    const operatorId = requireString(body, 'operatorId')
    const groupId = requireString(body, 'groupId')
    await requireUser(db, operatorId, '操作者')
    const ticket = await requireTicketRow(db, c.req.param('id'))
    if (ticket.status !== 'pending_assignment') throw apiError.invalidState('仅待分配工单可以分配')
    const group = await requireGroup(db, groupId)
    if (group.company_id !== ticket.company_id) throw apiError.validation('分配目标业务组须属于工单所属公司')
    const assignedAt = new Date().toISOString()
    await db.run({
      text: 'UPDATE tickets SET assigned_group_id = ?, status = ?, updated_at = ? WHERE id = ?',
      params: [group.id, 'pending_handling', assignedAt, ticket.id],
    })
    return c.json(await requireTicket(db, ticket.id))
  })
}
