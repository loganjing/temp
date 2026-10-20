import { forbidden } from '../api-error'
import type { Role } from '../../shared/tickets'

// 管理与跨公司能力仅限 ops（契约第 2/5/6 节）。
export function requireOps(actor: { role: Role }): void {
  if (actor.role !== 'ops') throw forbidden()
}

// ops 任意公司；handler 仅本公司（用于业务组/规则读取与统计入参校验）。
export function requireCompanyReadScope(actor: { role: Role; companyId: number }, companyId: number): void {
  if (actor.role === 'ops') return
  if (actor.role === 'handler' && actor.companyId === companyId) return
  throw forbidden()
}
