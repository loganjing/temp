import { createAuth } from '@commonapp/authkit'
import type { DbClient } from '@commonapp/dbkit'
import type { Context, MiddlewareHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { createUserResolver, createUserStore, type AuthUser } from '@commonapp/userkit'
import type { ApiErrorCode, UserRole } from '../../shared/ticket-domain'

type ProfileSummary = {
  role: UserRole
  department_id: string
  company_id: string
  company_name: string
  department_name: string
}

type CredentialProfileUser = {
  id: string
  role: string
  status: string
  passwordHash: string
  name: string
  email: string
  phone: string | null
  companyId: string | null
  departmentId: string | null
  roles: string[]
  passwordChangeRequired: boolean
}

function profileSummaryStatement(userId: string) {
  return {
    text: `SELECT p.role, d.id AS department_id, d.company_id, c.name AS company_name, d.name AS department_name
             FROM user_profiles p
             JOIN departments d ON d.id = p.department_id
             JOIN companies c ON c.id = d.company_id
            WHERE p.user_id = ?`,
    params: [userId],
  }
}

/**
 * authkit answers authentication and login failures with a plain `{ error: string }`
 * body; the ticket API contract requires the platform error object.
 */
async function setCodedError(context: Context, code: ApiErrorCode) {
  const status = context.res.status
  const body: unknown = await context.res.clone().json().catch(() => null)
  const message = body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined
  if (typeof message !== 'string') return
  context.res = context.json({ error: { code, message } }, status as ContentfulStatusCode)
}

export function createApplicationAuth(db: DbClient) {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore, {
    getRoles: async (userId) => {
      const profile = await db.queryOne<ProfileSummary>(profileSummaryStatement(userId))
      return profile ? [profile.role] : []
    },
  })
  const auth = createAuth({ userResolver })
  const loginRoute = auth.createLoginRoute<CredentialProfileUser>({
    loginField: 'email',
    findByCredential: async (email) => {
      const user = await userStore.findByCredential(email, 'email')
      if (!user) return null
      const profile = await db.queryOne<ProfileSummary>(profileSummaryStatement(user.id))
      return {
        id: user.id,
        role: profile?.role ?? 'user',
        status: user.enabled ? 'active' : 'disabled',
        passwordHash: user.passwordHash,
        name: user.name,
        email: user.email,
        phone: user.phone,
        companyId: profile?.company_id ?? user.companyId,
        departmentId: profile?.department_id ?? null,
        roles: profile ? [profile.role] : [],
        passwordChangeRequired: user.passwordChangeRequired,
      }
    },
    responseTransform: (user, token) => ({
      token,
      user: {
        id: user.id,
        role: user.role,
        status: user.status,
        name: user.name,
        email: user.email,
        companyId: user.companyId,
        departmentId: user.departmentId,
        roles: user.roles,
      },
    }),
  })

  const normalizeLogin: MiddlewareHandler = async (context, next) => {
    await next()
    if (context.res.status === 400) await setCodedError(context, 'validation_error')
    else if (context.res.status === 401) await setCodedError(context, 'invalid_credentials')
    else if (context.res.status === 403) await setCodedError(context, 'account_disabled')
    else if (context.res.status === 429) await setCodedError(context, 'rate_limited')
  }

  const requireAnyAuth: MiddlewareHandler = async (context, next) => {
    // authkit returns its rejection response instead of assigning it when it is
    // composed directly, so capture and publish that response before normalizing.
    const earlyResponse = await (
      auth.requireAnyAuth as unknown as (c: Context, next: () => Promise<void>) => Promise<Response | void>
    )(context, async () => {
      const user = (context as unknown as { get(key: string): AuthUser }).get('currentUser')
      if (user.passwordChangeRequired && !['/api/auth/me', '/api/auth/password'].includes(context.req.path)) {
        context.res = context.json({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } }, 403)
        return
      }
      await next()
    })
    if (earlyResponse) context.res = earlyResponse
    if (context.res.status === 401) await setCodedError(context, 'not_authenticated')
  }

  return { ...auth, requireAnyAuth, userStore, userResolver, loginRoute, normalizeLogin }
}
