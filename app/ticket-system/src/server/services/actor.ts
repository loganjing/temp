import { forbidden, notFound } from '../api-error'
import type { Role } from '../../shared/tickets'
// 业务操作者：全部字段来自服务端可信身份（token 解析后的 users JOIN user_profiles）。
export type Actor = {
  userId: string
  email: string
  displayName: string
  companyId: number
  department: string | null
  role: Role
}

export type TicketDomainRow = {
  id: number
  company_id: number
  submitter_user_id: string
  status: string
}

// 数据域判断（契约第 1/2 节）：不在数据域内的资源一律 404，不泄露存在性。
// submitter 域 = 本人工单；handler 域 = 本公司工单；ops 域 = 全部公司。
export function assertTicketVisible(actor: Actor, ticket: TicketDomainRow): void {
  if (actor.role === 'ops') return
  if (actor.role === 'handler' && actor.companyId === ticket.company_id) return
  if (actor.role === 'submitter' && actor.userId === ticket.submitter_user_id) return
  throw notFound('工单不存在')
}

// 域内但仅允许 ops / handler 的动作（assign/transfer/complete）：
// 可见性已由 assertTicketVisible 保证，此处只需拒绝域内 submitter。
export function requireHandlerOrOps(actor: Actor): void {
  if (actor.role !== 'ops' && actor.role !== 'handler') throw forbidden()
}
