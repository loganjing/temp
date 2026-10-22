export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function formatMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${Math.round(value * 10) / 10} 分钟`
}

export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${Math.round(value * 10) / 10} / 5`
}
