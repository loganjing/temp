// 展示格式化辅助（纯函数，无 API 依赖）。

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatScore(average: number | null): string {
  return average == null ? '暂无评价' : `${average.toFixed(1)} / 5`
}

export function formatMinutes(minutes: number | null): string {
  if (minutes == null) return '暂无数据'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return rest > 0 ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
}
