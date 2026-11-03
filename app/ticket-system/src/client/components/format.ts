/** 格式化时间戳（毫秒）为本地日期时间字符串。 */
export function formatDateTime(ms: number | null | undefined): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** 格式化毫秒时长为可读字符串。 */
export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '—'
  const seconds = Math.floor(ms / 1000)
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}天${hours}小时`
  if (hours > 0) return `${hours}小时${minutes}分`
  if (minutes > 0) return `${minutes}分`
  return `${seconds}秒`
}

export const STATUS_OPTIONS = ['created', 'pending_assign', 'pending_process', 'completed', 'cancelled'] as const
export const PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export const STATUS_LABEL: Record<string, string> = {
  created: '创建', pending_assign: '待分配', pending_process: '待处理', completed: '完成', cancelled: '取消',
}
