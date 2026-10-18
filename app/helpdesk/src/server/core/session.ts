// Session extraction and request locale helpers shared by route handlers.
import type { Context } from 'hono'
import type { Locale, Role } from '../../shared/domain'
import { authRequired } from './errors'
import type { DbClient } from '@commonapp/dbkit'

export interface SessionUser {
  /** Business user id (biz_users.id, numeric, used by every domain table). */
  id: number
  /** Platform credential id (userkit users.id, HMAC token subject). */
  credentialId: string
  role: Role
  nameZh: string
  nameEn: string
  email: string
  phone: string | null
  companyId: number | null
  status: number
}

export type AppEnv = {
  Variables: {
    currentUser: SessionUser
    locale?: string
  }
}

export function sessionFrom(c: Context<AppEnv>): SessionUser | undefined {
  return c.get('currentUser')
}

export function requireSession(c: Context<AppEnv>): SessionUser {
  const user = sessionFrom(c)
  if (!user) throw authRequired('AUTH_REQUIRED')
  return user
}

export function requestLocale(c: Context<AppEnv>): Locale {
  // The i18n middleware already resolved Accept-Language / x-i18n-locale.
  const fromMiddleware = c.get('locale')
  if (fromMiddleware === 'zh' || fromMiddleware === 'en') return fromMiddleware
  const header = c.req.header('accept-language')?.toLowerCase() ?? ''
  if (header.startsWith('zh')) return 'zh'
  return 'en'
}

export interface UserRow {
  id: number
  credential_user_id: string
  name_zh: string
  name_en: string
  email: string
  phone: string | null
  role: Role
  company_id: number | null
  status: number
}

export async function findBizUserById(db: DbClient, id: number): Promise<UserRow | null> {
  return db.queryOne<UserRow>({ text: 'SELECT * FROM biz_users WHERE id = ?', params: [id] })
}

export async function findBizUserByCredentialId(db: DbClient, credentialId: string): Promise<UserRow | null> {
  return db.queryOne<UserRow>({
    text: 'SELECT * FROM biz_users WHERE credential_user_id = ?',
    params: [credentialId],
  })
}

export async function findBizUserByEmail(db: DbClient, email: string): Promise<UserRow | null> {
  return db.queryOne<UserRow>({
    text: 'SELECT * FROM biz_users WHERE lower(email) = lower(?)',
    params: [email],
  })
}

export function toSessionUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    credentialId: row.credential_user_id,
    role: row.role,
    nameZh: row.name_zh,
    nameEn: row.name_en,
    email: row.email,
    phone: row.phone,
    companyId: row.company_id,
    status: row.status,
  }
}
