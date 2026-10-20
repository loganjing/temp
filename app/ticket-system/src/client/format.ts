import type { Role } from './api/types'

export const roleLabels: Record<Role, string> = {
  submitter: '提交人',
  handler: '处理人',
  admin: '配置管理员',
}

export function roleLabelOf(value: string): string {
  if (value === 'submitter' || value === 'handler' || value === 'admin') return roleLabels[value]
  return value
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatText(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : '—'
}
