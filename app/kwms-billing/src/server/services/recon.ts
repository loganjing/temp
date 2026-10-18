import type { DbClient } from '@commonapp/dbkit'
import type { AuthUser } from '@commonapp/userkit'
import { compareDates } from '../../shared/contracts'
import { newId, nextBillNo, nowIso, today } from '../common/billno'
import { errors } from '../common/errors'
import { assertCanAccessOrg, type OrgScope } from '../common/scope'
import { recordAuditEvent, writeChangeLog } from './auditlog'

// recon 域：应收对账单（YSDZ）——按组织/仓库/结算方/业务周期汇总暂存明细；
// 审核通过单事务锁定明细（已对账）并自动创建一一绑定的应收结算单（YSJS）。

export interface ReconStatementRow {
  id: string
  bill_no: string
  org_id: string
  warehouse_id: string
  owner_id: string
  period_start: string
  period_end: string
  total_amount: number
  line_count: number
  status: string
  remark: string | null
  created_at: string
  audited_at: string | null
}

export interface ReconStatementLineRow {
  id: string
  statement_id: string
  receivable_detail_id: string
  goods_category_id: string | null
  bill_date: string
  fee_type_id: string
  billing_mode: string
  business_qty: number | null
  unit_price: number | null
  min_charge: number | null
  raw_amount: number
  final_amount: number
  line_no: number
}

export function createReconService(db: DbClient, auditKit: { record(event: { type: string; actorUserId?: string; metadata?: Record<string, unknown> }): Promise<void> }) {
  async function loadStatement(id: string): Promise<ReconStatementRow | null> {
    return db.queryOne<ReconStatementRow>({ text: 'SELECT * FROM recon_statements WHERE id = ?', params: [id] })
  }

  async function list(filters: { orgId?: string | null; status?: string | null; page: number; pageSize: number }, scope: OrgScope): Promise<{ items: ReconStatementRow[]; total: number }> {
    const conditions: string[] = ['1 = 1']
    const params: unknown[] = []
    const effectiveOrgId = filters.orgId ?? (scope.isAdmin ? null : scope.orgId)
    if (effectiveOrgId) {
      conditions.push('s.org_id = ?')
      params.push(effectiveOrgId)
    } else if (!scope.isAdmin && scope.orgId) {
      conditions.push('s.org_id = ?')
      params.push(scope.orgId)
    }
    if (filters.status) {
      conditions.push('s.status = ?')
      params.push(filters.status)
    }
    const where = `WHERE ${conditions.join(' AND ')}`
    const total = await db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM recon_statements s ${where}`, params })
    const rows = await db.queryAll<ReconStatementRow>({
      text: `SELECT s.* FROM recon_statements s ${where} ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`,
      params: [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
    })
    return { items: rows, total: Number(total?.total ?? 0) }
  }

  async function detail(id: string): Promise<{ statement: ReconStatementRow; lines: ReconStatementLineRow[] } | null> {
    const statement = await loadStatement(id)
    if (!statement) return null
    const lines = await db.queryAll<ReconStatementLineRow>({ text: 'SELECT * FROM recon_statement_lines WHERE statement_id = ? ORDER BY line_no', params: [id] })
    return { statement, lines }
  }

  // 快照生成时按关联合同行回填单价（明细行自身无单价字段）
  async function resolveUnitPrice(quoteBillNo: string, feeTypeId: string, goodsCategoryId: string | null): Promise<number | null> {
    const row = await db.queryOne<{ unit_price: number | null }>({
      text: `SELECT l.unit_price FROM cc_quote_lines l JOIN cc_quotes q ON q.id = l.quote_id
             WHERE q.bill_no = ? AND l.fee_type_id = ? AND COALESCE(l.goods_category_id, '') = COALESCE(?, '') LIMIT 1`,
      params: [quoteBillNo, feeTypeId, goodsCategoryId ?? ''],
    })
    return row?.unit_price ?? null
  }

  // 汇总暂存应收明细（已对账自动过滤不展示），生成对账单与明细快照
  async function generate(user: AuthUser, payload: { orgId?: string; warehouseId?: string; ownerId?: string; periodStart?: string; periodEnd?: string; remark?: string | null }): Promise<{ statement: ReconStatementRow; lineCount: number }> {
    if (!payload.orgId) throw errors.required('orgId')
    if (!payload.warehouseId) throw errors.required('warehouseId')
    if (!payload.ownerId) throw errors.required('ownerId')
    if (!payload.periodStart) throw errors.required('periodStart')
    if (!payload.periodEnd) throw errors.required('periodEnd')
    assertCanAccessOrg(user, payload.orgId)
    if (compareDates(payload.periodStart, payload.periodEnd) > 0) throw errors.invalidInput('业务周期开始日期不可晚于结束日期', 'periodStart')

    const details = await db.queryAll<{
      id: string
      bill_date: string
      fee_type_id: string
      goods_category_id: string | null
      billing_mode: string
      business_qty: number | null
      min_charge: number | null
      raw_amount: number
      final_amount: number
      quote_bill_no: string
    }>({
      text: `SELECT id, bill_date, fee_type_id, goods_category_id, billing_mode, business_qty, min_charge, raw_amount, final_amount, quote_bill_no
             FROM receivable_details
             WHERE org_id = ? AND warehouse_id = ? AND owner_id = ? AND status = 'draft' AND bill_date >= ? AND bill_date <= ?
             ORDER BY bill_date, id`,
      params: [payload.orgId, payload.warehouseId, payload.ownerId, payload.periodStart, payload.periodEnd],
    })

    const totalAmount = details.reduce((sum, item) => sum + item.final_amount, 0)
    const statementId = newId()
    const timestamp = nowIso()
    let billNo = ''
    await db.transaction(async (tx) => {
      billNo = await nextBillNo(tx, 'YSDZ', today())
      await tx.run({
        text: `INSERT INTO recon_statements (id, bill_no, org_id, warehouse_id, owner_id, period_start, period_end, total_amount, line_count, status, remark, created_at, audited_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, NULL)`,
        params: [statementId, billNo, payload.orgId as string, payload.warehouseId as string, payload.ownerId as string, payload.periodStart as string, payload.periodEnd as string, totalAmount, details.length, payload.remark ?? null, timestamp],
      })
      let lineNo = 1
      for (const item of details) {
        const unitPrice = await resolveUnitPrice(item.quote_bill_no, item.fee_type_id, item.goods_category_id)
        await tx.run({
          text: `INSERT INTO recon_statement_lines (id, statement_id, receivable_detail_id, goods_category_id, bill_date, fee_type_id, billing_mode, business_qty, unit_price, min_charge, raw_amount, final_amount, line_no)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [newId(), statementId, item.id, item.goods_category_id, item.bill_date, item.fee_type_id, item.billing_mode, item.business_qty, unitPrice, item.min_charge, item.raw_amount, item.final_amount, lineNo],
        })
        lineNo += 1
      }
    })
    await recordAuditEvent(auditKit, { action: '新增', entityType: 'recon_statement', entityId: statementId, actorUserId: user.id, metadata: { billNo, lineCount: details.length, totalAmount } })
    const statement = (await loadStatement(statementId)) as ReconStatementRow
    return { statement, lineCount: details.length }
  }

  // 审核：单事务锁定明细 + 更新状态为已对账 + 自动创建一一绑定结算单；重复审核幂等
  async function audit(user: AuthUser, id: string): Promise<{ statement: ReconStatementRow; settlementId: string }> {
    const statement = await loadStatement(id)
    if (!statement) throw errors.notFound('对账单不存在或不可见')
    assertCanAccessOrg(user, statement.org_id)
    if (statement.status === 'approved') {
      const existing = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM settle_statements WHERE recon_statement_id = ?', params: [id] })
      return { statement, settlementId: existing?.id ?? '' }
    }
    if (statement.status !== 'draft') throw errors.invalidStatus('当前单据状态不允许该操作')

    const lines = await db.queryAll<{ receivable_detail_id: string; final_amount: number }>({
      text: 'SELECT receivable_detail_id, final_amount FROM recon_statement_lines WHERE statement_id = ? ORDER BY line_no',
      params: [id],
    })
    const settlementId = newId()
    let settlementBillNo = ''
    await db.transaction(async (tx) => {
      // 关联应收明细统一更新为已对账（若已被其他对账单锁定则整体回滚）
      for (const line of lines) {
        const updated = await tx.run({
          text: "UPDATE receivable_details SET status = 'reconciled' WHERE id = ? AND status = 'draft'",
          params: [line.receivable_detail_id],
        })
        if (updated.changes !== 1) throw errors.invalidStatus(`应收明细已被锁定或不存在：${line.receivable_detail_id}`)
      }
      await tx.run({ text: "UPDATE recon_statements SET status = 'approved', audited_at = ? WHERE id = ?", params: [nowIso(), id] })
      // 自动创建一一绑定的应收结算单：结算总金额默认等于对账总金额
      settlementBillNo = await nextBillNo(tx, 'YSJS', today())
      await tx.run({
        text: `INSERT INTO settle_statements (id, bill_no, recon_statement_id, org_id, warehouse_id, owner_id, recon_total_amount, settle_total_amount, invoice_total_amount, writeoff_total_amount, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'draft', ?, ?)`,
        params: [settlementId, settlementBillNo, id, statement.org_id, statement.warehouse_id, statement.owner_id, statement.total_amount, statement.total_amount, nowIso(), nowIso()],
      })
      await writeChangeLog(tx as unknown as DbClient, {
        entityType: 'recon_statement',
        entityId: id,
        changeType: '审核',
        before: { status: 'draft', totalAmount: statement.total_amount },
        after: { status: 'approved', totalAmount: statement.total_amount, settlementBillNo },
        reason: '对账单审核通过，自动生成应收结算单',
        operatorId: user.id,
      })
    })
    await recordAuditEvent(auditKit, { action: '审核', entityType: 'recon_statement', entityId: id, actorUserId: user.id, metadata: { billNo: statement.bill_no, settlementBillNo } })
    return { statement: (await loadStatement(id)) as ReconStatementRow, settlementId }
  }

  return { list, detail, generate, audit, loadStatement }
}

export type ReconService = ReturnType<typeof createReconService>
