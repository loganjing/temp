import type { Context, Hono } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import {
  AssetApplyBillError,
  createAssetApplyBill,
  getAssetApplyBill,
  listAssetApplyBills,
  parseListQuery,
} from './services/asset-apply-bill'
import {
  ASSET_APPLY_BILL_ERROR_CODES,
  ASSET_APPLY_BILL_MESSAGES,
  type ApiErrorBody,
} from '../shared/asset-apply-bill'

// 登录/SSO 等公开端点只在此注册；不得加入业务读写路由。
export function registerPublicRoutes(_app: Hono, _platform: Awaited<ReturnType<typeof initializePlatform>>) {}

// 业务路由在认证边界后注册；platform 包含已选模块的运行时资源。
export function registerProtectedRoutes(app: Hono, platform: Awaited<ReturnType<typeof initializePlatform>>) {
  // 创建保存：权威校验 → 事务取号 → 主表与分录原子落库，返回完整单据。
  app.post('/api/asset-apply-bills', async (c) => {
    // 非法 JSON 按空请求体处理，统一走权威校验返回 400。
    const body: unknown = await c.req.json().catch(() => null)
    try {
      const bill = await createAssetApplyBill(platform.db, body)
      return c.json(bill, 201)
    } catch (error) {
      return billErrorResponse(c, error)
    }
  })

  // 条件查询：billno/picker 包含匹配、pick_date 精确、分页。
  app.get('/api/asset-apply-bills', async (c) => {
    try {
      const result = await listAssetApplyBills(platform.db, parseListQuery(c.req.query()))
      return c.json(result)
    } catch (error) {
      return billErrorResponse(c, error)
    }
  })

  // 详情回读：主表全字段 + 分录按 seq 升序。
  app.get('/api/asset-apply-bills/:id', async (c) => {
    const id = Number(c.req.param('id'))
    if (!Number.isInteger(id) || id < 1) {
      return billNotFoundResponse(c)
    }
    try {
      return c.json(await getAssetApplyBill(platform.db, id))
    } catch (error) {
      return billErrorResponse(c, error)
    }
  })
}

function billNotFoundResponse(c: Context) {
  return c.json(
    {
      error: {
        code: ASSET_APPLY_BILL_ERROR_CODES.BILL_NOT_FOUND,
        message: ASSET_APPLY_BILL_MESSAGES.BILL_NOT_FOUND,
      },
    },
    404,
  )
}

/** 业务错误映射为统一错误结构；非业务错误交回平台 onError 兜底。 */
function billErrorResponse(c: Context, error: unknown) {
  if (error instanceof AssetApplyBillError) {
    const body: ApiErrorBody = error.details
      ? { error: { code: error.code, message: error.message, details: error.details } }
      : { error: { code: error.code, message: error.message } }
    return c.json(body, error.status)
  }
  throw error
}
