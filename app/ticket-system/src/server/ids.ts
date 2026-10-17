import { randomUUID } from 'node:crypto'

/** 工单 ID：TCK- + base36 时间戳 + 4 位随机后缀（架构基线 4.2，生成规则为需求开放项的最小方案）。 */
export function newTicketId(): string {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 4)
  return `TCK-${Date.now().toString(36)}${suffix}`
}

/** 其余表 id 用随机 UUID（架构基线 4.2）。 */
export function newId(): string {
  return randomUUID()
}
