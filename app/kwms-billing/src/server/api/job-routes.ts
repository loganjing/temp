import type { Hono } from 'hono'
import { errors } from '../common/errors'
import { jsonBody, paginated, paginationOf, route } from '../common/http'
import { requirePermission, type Platform } from '../common/scope'
import { authorizationRegistry } from '../platform/authorization'
import { createJobService } from '../services/billing-jobs'
import type { JobType } from '../../shared/contracts'

// jobs 域路由：手动触发定时任务与执行记录查询。
// 路径参数校验 jobType ∈ {daily-billing, monthly-billing, contract-expiry}。

const JOB_TYPES: JobType[] = ['daily-billing', 'monthly-billing', 'contract-expiry']

function parseJobType(raw: string): JobType {
  if (!JOB_TYPES.includes(raw as JobType)) throw errors.invalidInput('任务类型不存在', 'type')
  return raw as JobType
}

export function registerJobRoutes(app: Hono, platform: Platform) {
  const jobs = createJobService(platform.db)

  // POST /api/jobs/:type/run {targetDate?} → JobRunSummary
  app.post('/api/jobs/:type/run', requirePermission(platform, authorizationRegistry.permissions.jobRun.key), route(async (context) => {
    const body = await jsonBody(context)
    const jobType = parseJobType(context.req.param('type') ?? '')
    if (body.targetDate !== undefined && typeof body.targetDate !== 'string') throw errors.invalidInput('targetDate 须为 YYYY-MM-DD', 'targetDate')
    const summary = await jobs.run(jobType, body.targetDate)
    return context.json(summary)
  }))

  // GET /api/jobs/runs?type=&page=&pageSize（契约 9：type 过滤）
  app.get('/api/jobs/runs', requirePermission(platform, authorizationRegistry.permissions.jobView.key), route(async (context) => {
    const rawJobType = context.req.query('type') || null
    let jobType: JobType | null = null
    if (rawJobType) jobType = parseJobType(rawJobType)
    const pagination = paginationOf(context)
    const result = await jobs.listRuns(jobType, pagination.page, pagination.pageSize)
    return context.json(paginated(result.items, result.total, pagination))
  }))
}
