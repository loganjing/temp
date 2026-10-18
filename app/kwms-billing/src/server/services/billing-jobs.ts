import type { DbClient } from '@commonapp/dbkit'
import { compareDates, freeRentEndDate, type JobType } from '../../shared/contracts'
import { computeLine, type BillingMeasure } from './billing-engine'
import { dailyMeasureProvider, monthlyMeasureProvider } from './billing-measures'
import { newId, nowIso } from '../common/billno'
import { errors } from '../common/errors'

// billing 域定时任务：按天计费、按月计费、合同过期检测。
// node-cron 进程内调度（入口 index.ts 装配）；本模块提供可独立调用（手动触发/补偿）的执行体。
// job_runs 依据 (job_type, target_date) 防重：当日已成功则跳过，失败允许重跑。
// 计费任务按仓库/货主分组提交分块事务（AC-13 性能承载）。

export const JOB_TYPE_KEYS: Record<JobType, string> = {
  'daily-billing': 'daily_billing',
  'monthly-billing': 'monthly_billing',
  'contract-expiry': 'contract_expiry',
}

export interface JobError { orgId: string; warehouseId: string; ownerId: string; message: string }

export interface JobRunSummary {
  jobRunId: string
  jobType: JobType
  targetDate: string
  status: 'success' | 'failed' | 'skipped'
  generatedCount: number
  affectedCount: number
  failedCount: number
  errors: JobError[]
}

function toUtcDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function yesterdayOf(base: string): string {
  const date = toUtcDate(base)
  date.setUTCDate(date.getUTCDate() - 1)
  return formatDate(date)
}

export function lastDayOfPreviousMonth(base: string): string {
  const [year, month] = base.split('-').map(Number)
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1))
  firstOfMonth.setUTCDate(firstOfMonth.getUTCDate() - 1)
  return formatDate(firstOfMonth)
}

export function todayLocal(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

interface EffectiveQuoteRow {
  id: string
  bill_no: string
  org_id: string
  warehouse_id: string
  owner_id: string
  effect_start: string
  effect_end: string
  rent_free_days: number
  billing_period: string
}

interface QuoteLineWithDiscounts {
  id: string
  fee_type_id: string
  goods_category_id: string | null
  billing_mode: string
  billing_basis: string | null
  unit_price: number | null
  min_charge: number | null
  fixed_amount: number | null
  discounts: Array<{ lower_limit: number; upper_limit: number; discount_mode: string; percent_value: number | null; fixed_value: number | null }>
}

export function createJobService(db: DbClient) {
  async function findSuccessfulRun(jobTypeKey: string, targetDate: string) {
    return db.queryOne<{ id: string; generated_count: number; affected_count: number; failed_count: number }>({
      text: "SELECT id, generated_count, affected_count, failed_count FROM job_runs WHERE job_type = ? AND target_date = ? AND status = 'success' ORDER BY started_at DESC LIMIT 1",
      params: [jobTypeKey, targetDate],
    })
  }

  async function insertJobRun(jobTypeKey: string, targetDate: string, status: 'success' | 'failed', counts: { generated: number; affected: number; failed: number }, errorMessage: string | null): Promise<string> {
    const jobRunId = newId()
    const startedAt = nowIso()
    await db.run({
      text: 'INSERT INTO job_runs (id, job_type, target_date, status, generated_count, affected_count, failed_count, error_message, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [jobRunId, jobTypeKey, targetDate, status, counts.generated, counts.affected, counts.failed, errorMessage, startedAt, nowIso()],
    })
    return jobRunId
  }

  // 库存缺失通知：提醒该组织仓储运营人工触发重算
  async function notifyInventoryMissing(orgId: string, warehouseId: string, ownerId: string, sourceRunId: string): Promise<void> {
    const warehouse = await db.queryOne<{ name: string }>({ text: 'SELECT name FROM warehouses WHERE id = ?', params: [warehouseId] })
    const owner = await db.queryOne<{ name: string }>({ text: 'SELECT name FROM owners WHERE id = ?', params: [ownerId] })
    const users = await db.queryAll<{ id: string }>({
      text: `SELECT u.id FROM users u JOIN user_role_assignments r ON r.user_id = u.id
             WHERE r.role_key = 'warehouse_ops' AND u.company_id = ? AND u.enabled = 1`,
      params: [orgId],
    })
    const content = `仓库「${warehouse?.name ?? warehouseId}」货主「${owner?.name ?? ownerId}」库存数据缺失，计费任务已跳过，请人工核实后触发费用重算`
    for (const target of users) {
      await db.run({
        text: 'INSERT INTO notifications (id, user_id, content, source_run_id, read_flag, created_at) VALUES (?, ?, ?, ?, 0, ?)',
        params: [newId(), target.id, content, sourceRunId, nowIso()],
      })
    }
  }

  async function runBilling(kind: 'daily' | 'monthly', requestedTargetDate?: string): Promise<JobRunSummary> {
    const jobType: JobType = kind === 'daily' ? 'daily-billing' : 'monthly-billing'
    const jobTypeKey = JOB_TYPE_KEYS[jobType]
    const targetDate = requestedTargetDate ?? (kind === 'daily' ? yesterdayOf(todayLocal()) : lastDayOfPreviousMonth(todayLocal()))

    const existing = await findSuccessfulRun(jobTypeKey, targetDate)
    if (existing) {
      return {
        jobRunId: existing.id,
        jobType,
        targetDate,
        status: 'skipped',
        generatedCount: Number(existing.generated_count ?? 0),
        affectedCount: Number(existing.affected_count ?? 0),
        failedCount: Number(existing.failed_count ?? 0),
        errors: [],
      }
    }

    // 生成过滤：状态=已生效、记账日期在效期内、超出免租期；暂存/已终止/过期合同不参与
    const quotes = await db.queryAll<EffectiveQuoteRow>({
      text: `SELECT id, bill_no, org_id, warehouse_id, owner_id, effect_start, effect_end, rent_free_days, billing_period
             FROM cc_quotes WHERE status = 'effective' AND billing_period = ?`,
      params: [kind === 'daily' ? 'daily' : 'monthly'],
    })
    const qualifying = quotes.filter((quote) =>
      compareDates(quote.effect_start, targetDate) <= 0
      && compareDates(quote.effect_end, targetDate) >= 0
      && compareDates(targetDate, freeRentEndDate(quote.effect_start, quote.rent_free_days)) > 0,
    )

    const provider = kind === 'daily' ? dailyMeasureProvider : monthlyMeasureProvider
    const errors: JobError[] = []
    let generatedCount = 0
    const measureCache = new Map<string, BillingMeasure | null>()

    // 按仓库/货主分组，分块事务提交（避免长事务阻塞交互请求）
    const groups = new Map<string, EffectiveQuoteRow[]>()
    for (const quote of qualifying) {
      const key = `${quote.warehouse_id}::${quote.owner_id}`
      const bucket = groups.get(key) ?? []
      bucket.push(quote)
      groups.set(key, bucket)
    }

    for (const [groupKey, groupQuotes] of groups) {
      const [warehouseId, ownerId] = groupKey.split('::')
      const scopeMeasure = await provider.getMeasure(db, { warehouseId, ownerId, goodsCategoryId: null })
      if (scopeMeasure === null) {
        // 库存数据缺失：记录异常，跳过该组，通知仓储运营
        errors.push({
          orgId: groupQuotes[0].org_id,
          warehouseId,
          ownerId,
          message: '库存数据缺失，无法计费',
        })
        continue
      }
      await db.transaction(async (tx) => {
        for (const quote of groupQuotes) {
          // 幂等重跑：先清理同合同同账期已生成的暂存明细，再重新生成
          await tx.run({
            text: "DELETE FROM receivable_details WHERE quote_bill_no = ? AND bill_date = ? AND status = 'draft'",
            params: [quote.bill_no, targetDate],
          })
          const lines = await tx.queryAll<Omit<QuoteLineWithDiscounts, 'discounts'>>({
            text: 'SELECT id, fee_type_id, goods_category_id, billing_mode, billing_basis, unit_price, min_charge, fixed_amount FROM cc_quote_lines WHERE quote_id = ? ORDER BY line_no',
            params: [quote.id],
          })
          for (const line of lines) {
            const discounts = await tx.queryAll<QuoteLineWithDiscounts['discounts'][number]>({
              text: 'SELECT lower_limit, upper_limit, discount_mode, percent_value, fixed_value FROM cc_quote_discounts WHERE quote_line_id = ? ORDER BY lower_limit',
              params: [line.id],
            })

            const measureKey = `${warehouseId}::${ownerId}::${line.goods_category_id ?? ''}`
            let measure = measureCache.get(measureKey) ?? null
            if (measure === null && !measureCache.has(measureKey)) {
              measure = await provider.getMeasure(tx as unknown as DbClient, { warehouseId, ownerId, goodsCategoryId: line.goods_category_id })
              measureCache.set(measureKey, measure)
            }
            const outcome = computeLine(
              {
                billingMode: line.billing_mode as 'normal' | 'fixed_price' | 'max_value',
                billingBasis: line.billing_basis as 'stock_qty' | 'locations' | 'volume' | 'weight' | null,
                unitPrice: line.unit_price,
                minCharge: line.min_charge,
                fixedAmount: line.fixed_amount,
                discounts: discounts.map((discount) => ({
                  lowerLimit: discount.lower_limit,
                  upperLimit: discount.upper_limit,
                  discountMode: discount.discount_mode as 'percent' | 'fixed',
                  percentValue: discount.percent_value,
                  fixedValue: discount.fixed_value,
                })),
              },
              measure ?? { stockQty: 0, locations: 0, volume: 0, weight: 0 },
            )
            await tx.run({
              text: `INSERT INTO receivable_details (id, bill_date, org_id, warehouse_id, owner_id, fee_type_id, goods_category_id, billing_mode,
                     billing_basis, business_qty, raw_amount, discounted_amount, min_charge, final_amount, quote_bill_no, status, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
              params: [newId(), targetDate, quote.org_id, warehouseId, ownerId, line.fee_type_id, line.goods_category_id, line.billing_mode, line.billing_basis,
                outcome.businessQty, outcome.rawAmount, outcome.discountedAmount, outcome.minCharge, outcome.finalAmount, quote.bill_no, nowIso()],
            })
            generatedCount += 1
          }
        }
      })
    }

    const status = errors.length > 0 ? 'failed' : 'success'
    const jobRunId = await insertJobRun(
      jobTypeKey,
      targetDate,
      status,
      { generated: generatedCount, affected: qualifying.length, failed: errors.length },
      errors.length > 0 ? errors.map((error) => `${error.orgId}/${error.warehouseId}/${error.ownerId}: ${error.message}`).join('；') : null,
    )
    for (const error of errors) {
      await notifyInventoryMissing(error.orgId, error.warehouseId, error.ownerId, jobRunId)
    }
    return { jobRunId, jobType, targetDate, status, generatedCount, affectedCount: qualifying.length, failedCount: errors.length, errors }
  }

  async function runContractExpiry(requestedTargetDate?: string): Promise<JobRunSummary> {
    const targetDate = requestedTargetDate ?? todayLocal()
    const jobTypeKey = JOB_TYPE_KEYS['contract-expiry']
    const existing = await findSuccessfulRun(jobTypeKey, targetDate)
    if (existing) {
      return {
        jobRunId: existing.id,
        jobType: 'contract-expiry',
        targetDate,
        status: 'skipped',
        generatedCount: 0,
        affectedCount: Number(existing.affected_count ?? 0),
        failedCount: 0,
        errors: [],
      }
    }
    const result = await db.run({
      text: "UPDATE cc_quotes SET status = 'terminated', updated_at = ? WHERE status = 'effective' AND effect_end < ?",
      params: [nowIso(), targetDate],
    })
    const jobRunId = await insertJobRun(jobTypeKey, targetDate, 'success', { generated: 0, affected: result.changes, failed: 0 }, null)
    return { jobRunId, jobType: 'contract-expiry', targetDate, status: 'success', generatedCount: 0, affectedCount: result.changes, failedCount: 0, errors: [] }
  }

  async function run(jobType: JobType, targetDate?: string): Promise<JobRunSummary> {
    switch (jobType) {
      case 'daily-billing': return runBilling('daily', targetDate)
      case 'monthly-billing': return runBilling('monthly', targetDate)
      case 'contract-expiry': return runContractExpiry(targetDate)
      default: throw errors.notFound('任务类型不存在')
    }
  }

  async function listRuns(jobType: JobType | null, page: number, pageSize: number): Promise<{ items: Array<Record<string, unknown>>; total: number }> {
    const conditions: string[] = ['1 = 1']
    const params: unknown[] = []
    if (jobType) {
      conditions.push('job_type = ?')
      params.push(JOB_TYPE_KEYS[jobType])
    }
    const where = `WHERE ${conditions.join(' AND ')}`
    const total = await db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM job_runs ${where}`, params })
    const rows = await db.queryAll<{
      id: string
      job_type: string
      target_date: string
      status: string
      generated_count: number | null
      affected_count: number | null
      failed_count: number | null
      error_message: string | null
      started_at: string
      finished_at: string | null
    }>({
      text: `SELECT id, job_type, target_date, status, generated_count, affected_count, failed_count, error_message, started_at, finished_at
             FROM job_runs ${where} ORDER BY started_at DESC, id DESC LIMIT ? OFFSET ?`,
      params: [...params, pageSize, (page - 1) * pageSize],
    })
    const apiJobType: Record<string, JobType> = { daily_billing: 'daily-billing', monthly_billing: 'monthly-billing', contract_expiry: 'contract-expiry' }
    return {
      items: rows.map((row) => ({
        id: row.id,
        jobType: apiJobType[row.job_type as string] ?? row.job_type,
        targetDate: row.target_date,
        status: row.status,
        generatedCount: Number(row.generated_count ?? 0),
        affectedCount: Number(row.affected_count ?? 0),
        failedCount: Number(row.failed_count ?? 0),
        errorMessage: row.error_message ?? null,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
      })),
      total: Number(total?.total ?? 0),
    }
  }

  return { run, listRuns }
}

export type JobService = ReturnType<typeof createJobService>
