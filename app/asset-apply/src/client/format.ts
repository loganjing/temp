/** 日期时间展示：`yyyy-MM-ddTHH:mm:ss` → `yyyy-MM-dd HH:mm:ss`。 */
export function formatDateTime(value: string): string {
  return value.replace('T', ' ')
}

export function statusBadgeClass(status: string): string {
  if (status === '已审核') return 'badge badge-success'
  if (status === '已提交') return 'badge badge-info'
  return 'badge badge-neutral'
}
