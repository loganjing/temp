import type { DbClient } from '@commonapp/dbkit'
import type { AuthUser } from '@commonapp/userkit'
import { compareDates } from '../../shared/contracts'
import { newId, nextBillNo, nowIso, today } from '../common/billno'
import { errors } from '../common/errors'
import { assertCanAccessOrg, type OrgScope } from '../common/scope'
import { recordAuditEvent, writeChangeLog } from './auditlog'

// adjustments 域：应收费用调整单（YSTZ）——周期加载暂存明细、手动新增空白行、
// 审核生效后事务内回写应收明细金额并生成变更日志。

export interface AdjustmentRow {
  id: string
  bill_no: string
  org_id: string
  period_start: string
  period_end: string
  status: string
  remark: string | null
  created_at: string
  updated_at: string
}

export interface AdjustmentLineRow {
  id: string
  adjustment_id: string
  receivable_detail_id: string | null
  fee_type_id: string
  business_qty: number | null
  amount_before: number
  adjustment_amount: number
  amount_after: number
  reason: string | null
  line_no: number
}

export interface AdjustmentLineInput {
  receivableDetailId?: string | null
  feeTypeId?: string | null
  businessQty?: number | null
  adjustmentAmount: number
  reason: string
}

interface ReceivableDetailRow {
  id: string
  bill_date: string
  org_id: string
  warehouse_id: string
  owner_id: string
  fee_type_id: string
  goods_category_id: string | null
  business_qty: number | null
  final_amount: number
  status: string
}

export function createAdjustmentsService(db: DbClient, auditKit: { record(event: { type: string; actorUserId?: string; metadata?: Record<string, unknown> }): Promise<void> }) {
  async function loadAdjustment(id: string): Promise<AdjustmentRow | null> {
    return db.queryOne<AdjustmentRow>({ text: 'SELECT * FROM fee_adjustments WHERE id = ?', params: [id] })
  }

  async function list(filters: { orgId?: string | null; status?: string | null; page: number; pageSize: number }, scope: OrgScope): Promise<{ items: AdjustmentRow[]; total: number }> {
    const conditions: string[] = ['1 = 1']
    const params: unknown[] = []
    const effectiveOrgId = filters.orgId ?? (scope.isAdmin ? null : scope.orgId)
    if (effectiveOrgId) {
      conditions.push('a.org_id = ?')
      params.push(effectiveOrgId)
    } else if (!scope.isAdmin && scope.orgId) {
      conditions.push('a.org_id = ?')
      params.push(scope.orgId)
    }
    if (filters.status) {
      conditions.push('a.status = ?')
      params.push(filters.status)
    }
    const where = `WHERE ${conditions.join(' AND ')}`
    const total = await db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM fee_adjustments a ${where}`, params })
    const rows = await db.queryAll<AdjustmentRow>({
      text: `SELECT a.* FROM fee_adjustments a ${where} ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`,
      params: [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
    })
    return { items: rows, total: Number(total?.total ?? 0) }
  }

  async function detail(id: string): Promise<{ adjustment: AdjustmentRow; lines: AdjustmentLineRow[] } | null> {
    const adjustment = await loadAdjustment(id)
    if (!adjustment) return null
    const lines = await db.queryAll<AdjustmentLineRow>({ text: 'SELECT * FROM fee_adjustment_lines WHERE adjustment_id = ? ORDER BY line_no', params: [id] })
    return { adjustment, lines }
  }

  async function create(user: AuthUser, payload: { orgId?: string; periodStart?: string; periodEnd?: string; remark?: string | null }): Promise<AdjustmentRow> {
    if (!payload.orgId) throw errors.required('orgId')
    if (!payload.periodStart) throw errors.required('periodStart')
    if (!payload.periodEnd) throw errors.required('periodEnd')
    assertCanAccessOrg(user, payload.orgId)
    if (compareDates(payload.periodStart, payload.periodEnd) > 0) throw errors.invalidInput('业务周期开始日期不可晚于结束日期', 'periodStart')
    const adjustmentId = newId()
    const timestamp = nowIso()
    let billNo = ''
    await db.transaction(async (tx) => {
      billNo = await nextBillNo(tx, 'YSTZ', today())
      await tx.run({
        text: `INSERT INTO fee_adjustments (id, bill_no, org_id, period_start, period_end, status, remark, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
        params: [adjustmentId, billNo, payload.orgId as string, payload.periodStart as string, payload.periodEnd as string, payload.remark ?? null, timestamp, timestamp],
      })
    })
    await recordAuditEvent(auditKit, { action: '新增', entityType: 'adjustment', entityId: adjustmentId, actorUserId: user.id, metadata: { billNo } })
    return (await loadAdjustment(adjustmentId)) as AdjustmentRow
  }

  // 按业务周期批量加载仅暂存（未对账）明细为调整行；已对账明细自动过滤
  async function loadDetails(user: AuthUser, id: string): Promise<AdjustmentLineRow[]> {
    const adjustment = await loadAdjustment(id)
    if (!adjustment) throw errors.notFound('调整单不存在或不可见')
    assertCanAccessOrg(user, adjustment.org_id)
    if (adjustment.status !== 'draft') throw errors.invalidStatus('已生效调整单不可再加载费用明细')
    const details = await db.queryAll<ReceivableDetailRow>({
      text: `SELECT id, bill_date, org_id, warehouse_id, owner_id, fee_type_id, goods_category_id, business_qty, final_amount, status
             FROM receivable_details
             WHERE org_id = ? AND status = 'draft' AND bill_date >= ? AND bill_date <= ?
             ORDER BY bill_date, id`,
      params: [adjustment.org_id, adjustment.period_start, adjustment.period_end],
    })
    let lineNo = 1
    await db.transaction(async (tx) => {
      await tx.run({ text: 'DELETE FROM fee_adjustment_lines WHERE adjustment_id = ? AND receivable_detail_id IS NOT NULL', params: [id] })
      for (const item of details) {
        await tx.run({
          text: `INSERT INTO fee_adjustment_lines (id, adjustment_id, receivable_detail_id, fee_type_id, business_qty, amount_before, adjustment_amount, amount_after, reason, line_no)
                 VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, ?)`,
          params: [newId(), id, item.id, item.fee_type_id, item.business_qty, item.final_amount, item.final_amount, lineNo],
        })
        lineNo += 1
      }
    })
    return db.queryAll<AdjustmentLineRow>({ text: 'SELECT * FROM fee_adjustment_lines WHERE adjustment_id = ? ORDER BY line_no', params: [id] })
  }

  async function updateLines(user: AuthUser, id: string, lines: AdjustmentLineInput[]): Promise<AdjustmentLineRow[]> {
    const adjustment = await loadAdjustment(id)
    if (!adjustment) throw errors.notFound('调整单不存在或不可见')
    assertCanAccessOrg(user, adjustment.org_id)
    if (adjustment.status !== 'draft') throw errors.invalidStatus('已生效调整单不可编辑')
    if (!lines?.length) throw errors.required('lines')

    const prepared: Array<{ receivableDetailId: string | null; feeTypeId: string; businessQty: number | null; amountBefore: number; adjustmentAmount: number; amountAfter: number; reason: string }> = []
    for (const [index, line] of lines.entries()) {
      if (typeof line.adjustmentAmount !== 'number' || !Number.isInteger(line.adjustmentAmount)) {
        throw errors.invalidInput('调整金额必须为整数分', `lines[${index}].adjustmentAmount`)
      }
      if (line.adjustmentAmount <= 0) throw errors.adjustmentNegative()
      if (!line.reason?.trim()) throw errors.required(`lines[${index}].reason`)
      if (line.receivableDetailId) {
        const detail = await db.queryOne<ReceivableDetailRow>({ text: 'SELECT id, org_id, status, fee_type_id, final_amount FROM receivable_details WHERE id = ?', params: [line.receivableDetailId] })
        if (!detail) throw errors.notFound(`应收明细不存在：${line.receivableDetailId}`)
        if (detail.org_id !== adjustment.org_id) throw errors.orgForbidden()
        if (detail.status !== 'draft') throw errors.invalidStatus('带出明细已对账，不可调整')
        // amountBefore 服务端权威取当前明细金额（只读带出），amountAfter 自动计算
        const amountBefore = detail.final_amount
        prepared.push({
          receivableDetailId: detail.id,
          feeTypeId: detail.fee_type_id,
          businessQty: null,
          amountBefore,
          adjustmentAmount: line.adjustmentAmount,
          amountAfter: amountBefore + line.adjustmentAmount,
          reason: line.reason.trim(),
        })
      } else {
        if (!line.feeTypeId) throw errors.required(`lines[${index}].feeTypeId`)
        const feeType = await db.queryOne({ text: 'SELECT id FROM fee_types WHERE id = ?', params: [line.feeTypeId] })
        if (!feeType) throw errors.notFound(`费用类型不存在：${line.feeTypeId}`)
        prepared.push({
          receivableDetailId: null,
          feeTypeId: line.feeTypeId,
          businessQty: line.businessQty ?? null,
          amountBefore: 0,
          adjustmentAmount: line.adjustmentAmount,
          amountAfter: line.adjustmentAmount,
          reason: line.reason.trim(),
        })
      }
    }

    let lineNo = 1
    await db.transaction(async (tx) => {
      await tx.run({ text: 'DELETE FROM fee_adjustment_lines WHERE adjustment_id = ?', params: [id] })
      for (const line of prepared) {
        await tx.run({
          text: `INSERT INTO fee_adjustment_lines (id, adjustment_id, receivable_detail_id, fee_type_id, business_qty, amount_before, adjustment_amount, amount_after, reason, line_no)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [newId(), id, line.receivableDetailId, line.feeTypeId, line.businessQty, line.amountBefore, line.adjustmentAmount, line.amountAfter, line.reason, lineNo],
        })
        lineNo += 1
      }
      await tx.run({ text: 'UPDATE fee_adjustments SET updated_at = ? WHERE id = ?', params: [nowIso(), id] })
    })
    await recordAuditEvent(auditKit, { action: '编辑', entityType: 'adjustment', entityId: id, actorUserId: user.id, metadata: { billNo: adjustment.bill_no, lineCount: prepared.length } })
    return db.queryAll<AdjustmentLineRow>({ text: 'SELECT * FROM fee_adjustment_lines WHERE adjustment_id = ? ORDER BY line_no', params: [id] })
  }

  // 审核生效：事务内同步回写应收明细最终金额并写变更日志（前后金额、调整原因）
  async function audit(user: AuthUser, id: string): Promise<AdjustmentRow> {
    const adjustment = await loadAdjustment(id)
    if (!adjustment) throw errors.notFound('调整单不存在或不可见')
    assertCanAccessOrg(user, adjustment.org_id)
    if (adjustment.status === 'effective') return adjustment
    if (adjustment.status !== 'draft') throw errors.invalidStatus('当前单据状态不允许该操作')

    const lines = await db.queryAll<AdjustmentLineRow>({ text: 'SELECT * FROM fee_adjustment_lines WHERE adjustment_id = ? ORDER BY line_no', params: [id] })
    if (!lines.length) throw errors.invalidStatus('调整单无费用明细行，不可审核')
    await db.transaction(async (tx) => {
      for (const line of lines) {
        if (line.receivable_detail_id) {
          const detail = await tx.queryOne<ReceivableDetailRow>({ text: 'SELECT id, status, final_amount FROM receivable_details WHERE id = ?', params: [line.receivable_detail_id] })
          if (!detail || detail.status !== 'draft') throw errors.invalidStatus(`带出明细已对账或不存在，无法回写：${line.receivable_detail_id}`)
          await tx.run({ text: 'UPDATE receivable_details SET final_amount = ? WHERE id = ?', params: [line.amount_after, line.receivable_detail_id] })
          await writeChangeLog(tx as unknown as DbClient, {
            entityType: 'receivable',
            entityId: line.receivable_detail_id,
            changeType: '调整',
            before: { finalAmount: detail.final_amount },
            after: { finalAmount: line.amount_after },
            reason: `费用调整单 ${adjustment.bill_no}：${line.reason ?? ''}`,
            operatorId: user.id,
          })
        }
      }
      await tx.run({ text: "UPDATE fee_adjustments SET status = 'effective', updated_at = ? WHERE id = ?", params: [nowIso(), id] })
    })
    await recordAuditEvent(auditKit, { action: '审核', entityType: 'adjustment', entityId: id, actorUserId: user.id, metadata: { billNo: adjustment.bill_no, lineCount: lines.length } })
    return (await loadAdjustment(id)) as AdjustmentRow
  }

  return { list, detail, create, loadDetails, updateLines, audit, loadAdjustment }
}

export type AdjustmentsService = ReturnType<typeof createAdjustmentsService>
