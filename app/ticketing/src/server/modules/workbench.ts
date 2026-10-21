import type { DbClient } from '@commonapp/dbkit'
import type { Ticket } from '../../shared/contracts'
import { isPriority } from '../../shared/contracts'
import { mapTicket, TICKET_SELECT, type TicketRow } from './ticket'

// workbench 只读 ticket 数据，复用 ticket 模块的选择与映射。
export interface WorkbenchOptions {
  companyId?: string
  category?: string
  priority?: string
  q?: string
  sort?: string
  order?: string
  group?: string
}

export async function listWorkbench(
  db: DbClient,
  companyId: number,
  groupIds: number[],
  opts: WorkbenchOptions,
): Promise<Ticket[]> {
  // 公司筛选参数传入非本公司 ID 时返回空结果集（契约 §1）。
  if (opts.companyId != null && opts.companyId !== '' && Number(opts.companyId) !== companyId) return []
  const group = opts.group !== 'false'
  if (group && groupIds.length === 0) return []
  const conditions = ['t.status = ?', 't.company_id = ?']
  const params: unknown[] = ['processing', companyId]
  if (group) {
    conditions.push(`t.current_group_id IN (${groupIds.map(() => '?').join(',')})`)
    params.push(...groupIds)
  }
  if (opts.category) {
    conditions.push('t.category = ?')
    params.push(opts.category)
  }
  if (opts.priority && isPriority(opts.priority)) {
    conditions.push('t.priority = ?')
    params.push(opts.priority)
  }
  if (opts.q) {
    conditions.push('(t.subject LIKE ? OR t.ticket_no = ?)')
    params.push(`%${opts.q}%`, opts.q)
  }
  const sort = opts.sort === 'priority' ? 't.priority' : 't.created_at'
  const order = opts.order === 'asc' ? 'ASC' : 'DESC'
  const rows = await db.queryAll<TicketRow>({
    text: `${TICKET_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY ${sort} ${order}, t.id ${order}`,
    params,
  })
  return rows.map(mapTicket)
}
