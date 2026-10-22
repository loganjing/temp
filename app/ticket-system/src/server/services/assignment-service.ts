import { randomUUID } from 'node:crypto'
import type { CategoryDTO, AssignmentRuleDTO } from '../../shared/types'
import { type ServiceContext, BusinessError, now } from './context'

export function createAssignmentService(ctx: ServiceContext) {
  const { db } = ctx

  return {
    async matchRule(companyId: string, categoryId: string): Promise<string | null> {
      const rule = await db.queryOne<{ group_id: string }>({
        text: 'SELECT group_id FROM assignment_rules WHERE company_id = ? AND category_id = ?',
        params: [companyId, categoryId],
      })
      return rule?.group_id ?? null
    },

    async createCategory(companyId: string, name: string): Promise<CategoryDTO> {
      const id = randomUUID()
      const ts = now()
      await db.run({
        text: 'INSERT INTO categories (id, name, company_id, created_at) VALUES (?, ?, ?, ?)',
        params: [id, name, companyId, ts],
      })
      return { id, name, companyId }
    },

    async listCategories(companyId: string): Promise<CategoryDTO[]> {
      const rows = await db.queryAll<{ id: string; name: string; company_id: string }>({
        text: 'SELECT id, name, company_id FROM categories WHERE company_id = ? ORDER BY name',
        params: [companyId],
      })
      return rows.map((r) => ({ id: r.id, name: r.name, companyId: r.company_id }))
    },

    async createAssignmentRule(companyId: string, categoryId: string, groupId: string): Promise<AssignmentRuleDTO> {
      // Validate category and group belong to same company
      const category = await db.queryOne<{ company_id: string }>({ text: 'SELECT company_id FROM categories WHERE id = ?', params: [categoryId] })
      if (!category || category.company_id !== companyId) throw new BusinessError('NOT_FOUND', '分类不存在或不属于同公司', 404)
      const group = await db.queryOne<{ company_id: string }>({ text: 'SELECT company_id FROM business_groups WHERE id = ?', params: [groupId] })
      if (!group || group.company_id !== companyId) throw new BusinessError('NOT_FOUND', '业务组不存在或不属于同公司', 404)

      // Check for duplicate (same company + same category)
      const existing = await db.queryOne<{ id: string }>({
        text: 'SELECT id FROM assignment_rules WHERE company_id = ? AND category_id = ?',
        params: [companyId, categoryId],
      })
      if (existing) throw new BusinessError('CONFLICT', '该分类已存在分配规则', 409)

      const id = randomUUID()
      const ts = now()
      await db.run({
        text: 'INSERT INTO assignment_rules (id, company_id, category_id, group_id, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [id, companyId, categoryId, groupId, ts],
      })
      const row = await db.queryOne<{ category_name: string; group_name: string }>({
        text: `SELECT ar.id, c.name AS category_name, g.name AS group_name
               FROM assignment_rules ar
               LEFT JOIN categories c ON ar.category_id = c.id
               LEFT JOIN business_groups g ON ar.group_id = g.id
               WHERE ar.id = ?`,
        params: [id],
      })
      return {
        id,
        companyId,
        categoryId,
        categoryName: row?.category_name ?? '',
        groupId,
        groupName: row?.group_name ?? '',
      }
    },

    async listAssignmentRules(companyId: string): Promise<AssignmentRuleDTO[]> {
      const rows = await db.queryAll<{
        id: string; company_id: string; category_id: string; category_name: string; group_id: string; group_name: string
      }>({
        text: `SELECT ar.id, ar.company_id, ar.category_id, ar.group_id,
                      c.name AS category_name, g.name AS group_name
               FROM assignment_rules ar
               LEFT JOIN categories c ON ar.category_id = c.id
               LEFT JOIN business_groups g ON ar.group_id = g.id
               WHERE ar.company_id = ? ORDER BY c.name`,
        params: [companyId],
      })
      return rows.map((r) => ({
        id: r.id,
        companyId: r.company_id,
        categoryId: r.category_id,
        categoryName: r.category_name,
        groupId: r.group_id,
        groupName: r.group_name,
      }))
    },
  }
}
