// Serialization with bilingual fallback (contract §1: fallback happens on the
// server; the client never sees an empty name when only one language exists).
import type { Locale, Priority, Ref, Role, TicketStatus, UserRef } from '../../shared/domain'

export function localizedPair(locale: Locale, zh: string | null | undefined, en: string | null | undefined): { nameZh: string; nameEn: string } {
  const zhValue = (zh ?? '').trim()
  const enValue = (en ?? '').trim()
  const nameZh = zhValue || enValue
  const nameEn = enValue || zhValue
  return { nameZh, nameEn }
}

export function displayNameOf(locale: Locale, zh: string | null | undefined, en: string | null | undefined): string {
  const { nameZh, nameEn } = localizedPair(locale, zh, en)
  return locale === 'zh' ? nameZh : nameEn
}

export function serializeRef(locale: Locale, id: number | null | undefined, zh: string | null | undefined, en: string | null | undefined): Ref | null {
  if (id === null || id === undefined) return null
  const { nameZh, nameEn } = localizedPair(locale, zh, en)
  return { id, nameZh, nameEn }
}

export interface UserRefSource {
  id: number
  name_zh: string
  name_en: string
  email: string
  role: Role
}

export function serializeUserRef(locale: Locale, user: UserRefSource | null | undefined): UserRef | null {
  if (!user) return null
  const { nameZh, nameEn } = localizedPair(locale, user.name_zh, user.name_en)
  return {
    id: user.id,
    nameZh,
    nameEn,
    displayName: locale === 'zh' ? nameZh : nameEn,
    email: user.email,
    role: user.role,
  }
}

export function priorityWeight(priority: Priority): number {
  switch (priority) {
    case 'urgent':
      return 4
    case 'high':
      return 3
    case 'medium':
      return 2
    default:
      return 1
  }
}

export function isTicketStatus(value: string): value is TicketStatus {
  return [
    'draft',
    'pending_assign',
    'assigned',
    'in_progress',
    'on_hold',
    'pending_confirm',
    'cancelled',
    'closed',
  ].includes(value)
}
