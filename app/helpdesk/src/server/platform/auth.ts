// Server identity binding: contract-shaped login/logout/me on top of authkit
// primitives (scrypt password hashing, HMAC tokens, Lingee code exchange).
// authkit's own middleware/login route are not used directly because their
// error envelope ({ error: string }) does not match the contract §1 shape.
import {
  createMemoryCache,
  createTokenService,
  hashPassword,
  loadConfigFromEnv,
  verifyLingeeCode,
  verifyPassword,
  type AppUser,
  type LingeeAuthResult,
} from '@commonapp/authkit'
import { createUserResolver, createUserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'
import type { MiddlewareHandler } from 'hono'
import type { Locale, UserRef } from '../../shared/domain'
import { localizedPair, serializeUserRef } from '../core/serialize'
import { invalidCredentials } from '../core/errors'
import { message } from '../core/messages'
import { findBizUserByCredentialId, toSessionUser, type AppEnv, type SessionUser } from '../core/session'

export interface LoginResult {
  token: string
  user: UserRef
}

export interface MeProfile {
  id: number
  email: string
  role: string
  nameZh: string
  nameEn: string
  companyId: number | null
  companyNameZh?: string
  companyNameEn?: string
}

export interface HelpdeskAuth {
  authBoundary: MiddlewareHandler<AppEnv>
  login(email: string, password: string, locale: Locale): Promise<LoginResult>
  logout(token: string): void
  profile(user: SessionUser): Promise<MeProfile>
  verifyLingee(code: string): Promise<LingeeAuthResult<AppUser>>
  hashPassword: typeof hashPassword
}

export function createHelpdeskAuth(db: DbClient): HelpdeskAuth {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore)
  const config = loadConfigFromEnv()
  const tokenService = createTokenService({ secret: config.jwtSecret, ttlMs: config.tokenTtlMs })
  // Logout revocation. In-memory only; tokens also carry a 7-day expiry.
  const revokedTokens = new Set<string>()
  const lingeeCache = createMemoryCache()

  const authBoundary: MiddlewareHandler<AppEnv> = async (c, next) => {
    const locale: Locale = c.req.header('accept-language')?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
    const reject = () =>
      c.json({ error: { code: 'AUTH_REQUIRED', message: message(locale, 'authRequired') } }, 401)
    const header = c.req.header('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!token) return reject()
    const payload = tokenService.verify(token)
    if (!payload || revokedTokens.has(token)) return reject()
    const bizRow = await findBizUserByCredentialId(db, payload.userId)
    if (!bizRow || bizRow.status !== 1) return reject()
    c.set('currentUser', toSessionUser(bizRow))
    await next()
  }

  async function login(email: string, password: string, locale: Locale): Promise<LoginResult> {
    const invalid = () => invalidCredentials(message(locale, 'invalidCredentials'))
    if (!email || !password) throw invalid()
    const record = await userStore.findByCredential(email.trim(), 'email')
    if (!record || !record.enabled) throw invalid()
    if (!verifyPassword(password, record.passwordHash)) throw invalid()
    const bizRow = await findBizUserByCredentialId(db, record.id)
    if (!bizRow || bizRow.status !== 1) throw invalid()
    const user = serializeUserRef(locale, bizRow)
    if (!user) throw invalid()
    return { token: tokenService.sign(record.id), user }
  }

  async function profile(user: SessionUser): Promise<MeProfile> {
    const pair = localizedPair('zh', user.nameZh, user.nameEn)
    const company = user.companyId
      ? await db.queryOne<{ name_zh: string; name_en: string }>({
          text: 'SELECT name_zh, name_en FROM companies WHERE id = ?',
          params: [user.companyId],
        })
      : null
    const companyName = company ? localizedPair('zh', company.name_zh, company.name_en) : null
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      nameZh: pair.nameZh,
      nameEn: pair.nameEn,
      companyId: user.companyId,
      companyNameZh: companyName?.nameZh,
      companyNameEn: companyName?.nameEn,
    }
  }

  function verifyLingee(code: string): Promise<LingeeAuthResult<AppUser>> {
    return verifyLingeeCode(code, {
      consoleUrl: config.lingeeConsoleUrl ?? '',
      cache: lingeeCache,
      config,
      userResolver,
    })
  }

  return {
    authBoundary,
    login,
    logout: (token: string) => {
      revokedTokens.add(token)
    },
    profile,
    verifyLingee,
    hashPassword,
  }
}
