import 'dotenv/config'
import type { MiddlewareHandler } from 'hono'
import { serve } from '@hono/node-server'
import { schedule, type ScheduledTask } from 'node-cron'
import { createApp } from './app'
import { initializePlatform } from './platform/bootstrap'
import { registerPublicRoutes, registerProtectedRoutes } from './routes'
import { createJobService } from './services/billing-jobs'

const platform = await initializePlatform()
const app = createApp({
  registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
  registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
  protect: platform.auth.requireAnyAuth as MiddlewareHandler,
})
const port = Number(process.env.PORT || 3000)
const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`[${process.env.npm_package_name ?? 'app'}] server listening on :${port}`)
})

// 定时任务装配（需求 9.3，进程内调度）：
// - 按天计费：每日 00:00 生成前一日的费用明细；
// - 按月计费：每月 1 日 00:00 生成上月（账期末日）费用明细；
// - 合同过期检测：每日 00:05 将过期合同置为已终止。
// job_runs 依 (job_type, target_date, success) 防重；库存缺失通知 warehouse_ops 用户。
const jobs = createJobService(platform.db)
const cronJobs: ScheduledTask[] = [
  schedule('0 0 * * *', () => {
    void jobs.run('daily-billing').catch((error) => console.error('[cron] daily-billing failed', error))
  }),
  schedule('0 0 1 * *', () => {
    void jobs.run('monthly-billing').catch((error) => console.error('[cron] monthly-billing failed', error))
  }),
  schedule('5 0 * * *', () => {
    void jobs.run('contract-expiry').catch((error) => console.error('[cron] contract-expiry failed', error))
  }),
]

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close(() => {
    for (const task of cronJobs) task.stop()
    void platform.close()
  }))
}
