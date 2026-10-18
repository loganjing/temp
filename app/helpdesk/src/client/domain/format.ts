// 展示格式化：日期、双语名称取值、字节大小。
// 双语字段按当前语言直接取服务端已回退的返回值，不做二次回退判断。
import { ApiRequestError } from '../platform/api-client'

/** 服务端错误文案优先（契约错误结构里的 message），否则给通用兜底 */
export function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) return error.message || fallback
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export interface LocalizedName {
  nameZh: string
  nameEn?: string | null
}

export function localizedName(ref: LocalizedName | null | undefined, locale: string): string {
  if (!ref) return '—'
  return (locale === 'zh' ? ref.nameZh : ref.nameEn) || ''
}

export interface LocalizedUser extends LocalizedName {
  displayName?: string
}

export function localizedUser(user: LocalizedUser | null | undefined, locale: string): string {
  if (!user) return '—'
  if (user.displayName) return user.displayName
  return (locale === 'zh' ? user.nameZh : user.nameEn) || ''
}

export function subjectOf(ticket: { subjectZh: string; subjectEn?: string | null }, locale: string): string {
  return (locale === 'zh' ? ticket.subjectZh : ticket.subjectEn) || ''
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatHours(value: number): string {
  return `${value.toFixed(1)} h`
}

/** 通用启停状态文案：尝试 common.status.<value>，无翻译时回退原值 */
export function statusText(t: (key: string) => string, status: string): string {
  const key = `common.statusValue.${status}`
  const text = t(key)
  return text === key ? status : text
}
