// Server-side message resources. Values live in src/shared/locales so both
// server and shared tooling can consume them (contract: server-serialized texts).
import zh from '../../shared/locales/zh.json'
import en from '../../shared/locales/en.json'
import type { Locale } from '../../shared/domain'

type ServerMessages = Record<string, string>

const zhServer = (zh as { server?: ServerMessages }).server ?? {}
const enServer = (en as { server?: ServerMessages }).server ?? {}

export function message(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const raw = locale === 'zh' ? (zhServer[key] ?? enServer[key]) : (enServer[key] ?? zhServer[key])
  if (raw === undefined) return key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
}
