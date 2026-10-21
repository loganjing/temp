/**
 * identity 模块：当前用户上下文、退出登录与用户列表（契约第 2 节）。
 */
import type { Hono } from 'hono'
import type { PlatformResources } from '../platform/bootstrap'
import { findAuthProfile, toAuthUser } from '../profile'
import { ApiError, currentUser, currentProfile, resolveCompanyFilter, route } from '../http'
import { listUserBriefsByCompany } from '../views'

export function registerIdentityRoutes(app: Hono, platform: PlatformResources): void {
  const { db } = platform

  // 契约 2.3：当前登录用户的业务档案（AuthUser）。
  app.get(
    '/api/auth/me',
    route(async (context) => {
      const profile = await findAuthProfile(db, currentUser(context).id)
      if (!profile) throw new ApiError(403, 'PROFILE_NOT_FOUND', '当前用户缺少业务档案，请联系管理员')
      return context.json(toAuthUser(profile))
    }),
  )

  // 契约 2.2：退出登录（Bearer 无状态令牌，服务端直接确认登出）。
  app.post('/api/auth/logout', (context) => context.body(null, 204))

  // 契约 2.4：用户列表（转派目标与成员选择）；默认本公司，跨公司视角可指定公司。
  app.get(
    '/api/users',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const companyId = resolveCompanyFilter(context, me)
      return context.json(await listUserBriefsByCompany(db, companyId))
    }),
  )
}
