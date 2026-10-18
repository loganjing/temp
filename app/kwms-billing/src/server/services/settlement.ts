import type { DbClient } from '@commonapp/dbkit'
import type { AuthUser } from '@commonapp/userkit'
import { newId, nowIso, today } from '../common/billno'
import { errors } from '../common/errors'
import { assertCanAccessOrg, type OrgScope } from '../common/scope'
import { recordAuditEvent, writeChangeLog } from './auditlog'

// settlement 域：应收结算单（YSJS）——对账审核后自动生成；
// 结算金额微调校验、开票与核销累计约束事务；无终态，记录永久留存。

export interface SettleStatementRow {
  id: string
  bill_no: string
  recon_statement_id: string
  org_id: string
  warehouse_id: string
  owner_id: string
  recon_total_amount: number
  settle_total_amount: number
  invoice_total_amount: number
  writeoff_total_amount: number
  status: string
  created_at: string
  updated_at: string
}

export interface InvoiceRow {
  id: string
  settlement_id: string
  invoice_date: string
  invoicer: string
  invoice_no: string
  amount: number
  created_at: string
}

export interface WriteoffRow {
  id: string
  settlement_id: string
  writeoff_date: string
  amount: number
  operator: string
  created_at: string
}

export interface SettleStatementLineSnapshot {
  id: string
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
}

export function createSettlementService(db: DbClient, auditKit: { record(event: { type: string; actorUserId?: string; metadata?: Record<string, unknown> }): Promise<void> }) {
  async function loadStatement(id: string): Promise<SettleStatementRow | null> {
    return db.queryOne<SettleStatementRow>({ text: 'SELECT * FROM settle_statements WHERE id = ?', params: [id] })
  }

  async function list(filters: { orgId?: string | null; status?: string | null; page: number; pageSize: number }, scope: OrgScope): Promise<{ items: SettleStatementRow[]; total: number }> {
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
    const total = await db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM settle_statements s ${where}`, params })
    const rows = await db.queryAll<SettleStatementRow>({
      text: `SELECT s.* FROM settle_statements s ${where} ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`,
      params: [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
    })
    return { items: rows, total: Number(total?.total ?? 0) }
  }

  async function detail(id: string): Promise<{ statement: SettleStatementRow; invoices: InvoiceRow[]; writeoffs: WriteoffRow[]; lines: SettleStatementLineSnapshot[] } | null> {
    const statement = await loadStatement(id)
    if (!statement) return null
    // 开票/核销明细按发生顺序输出（rowid=插入序；created_at 同毫秒时按随机 id 排序不稳定）
    const invoices = await db.queryAll<InvoiceRow>({ text: 'SELECT * FROM invoices WHERE settlement_id = ? ORDER BY rowid', params: [id] })
    const writeoffs = await db.queryAll<WriteoffRow>({ text: 'SELECT * FROM writeoffs WHERE settlement_id = ? ORDER BY rowid', params: [id] })
    // 费用明细标签页：对账明细快照
    const lines = await db.queryAll<SettleStatementLineSnapshot>({
      text: `SELECT l.id, l.receivable_detail_id, l.goods_category_id, l.bill_date, l.fee_type_id, l.billing_mode, l.business_qty, l.unit_price, l.min_charge, l.raw_amount, l.final_amount
             FROM recon_statement_lines l WHERE l.statement_id = ? ORDER BY l.line_no`,
      params: [statement.recon_statement_id],
    })
    return { statement, invoices, writeoffs, lines }
  }

  // 结算金额微调：默认等于对账总额，支持少量抹零（0 < 值 ≤ 对账总额）
  async function adjustSettleAmount(user: AuthUser, id: string, settleTotalAmount: number): Promise<SettleStatementRow> {
    const statement = await requireStatement(user, id)
    if (typeof settleTotalAmount !== 'number' || !Number.isInteger(settleTotalAmount)) throw errors.invalidInput('结算总金额必须为整数分', 'settleTotalAmount')
    if (settleTotalAmount <= 0) throw errors.negative('settleTotalAmount')
    if (settleTotalAmount > statement.recon_total_amount) throw errors.amountExceed('结算总金额不可超过对账总金额')
    await db.transaction(async (tx) => {
      await tx.run({ text: 'UPDATE settle_statements SET settle_total_amount = ?, updated_at = ? WHERE id = ?', params: [settleTotalAmount, nowIso(), id] })
      await writeChangeLog(tx as unknown as DbClient, {
        entityType: 'settle_statement',
        entityId: id,
        changeType: '编辑',
        before: { settleTotalAmount: statement.settle_total_amount },
        after: { settleTotalAmount },
        reason: '结算金额微调（抹零）',
        operatorId: user.id,
      })
    })
    return (await loadStatement(id)) as SettleStatementRow
  }

  // 开票：累计开票金额不超过结算总金额；新增开票明细并实时累加开票总金额
  async function issueInvoice(user: AuthUser, id: string, payload: { invoicer?: string; invoiceNo?: string; amount?: number }): Promise<{ statement: SettleStatementRow; invoice: InvoiceRow }> {
    const statement = await requireStatement(user, id)
    if (!payload.invoicer?.trim()) throw errors.required('invoicer')
    if (!payload.invoiceNo?.trim()) throw errors.required('invoiceNo')
    if (typeof payload.amount !== 'number' || !Number.isInteger(payload.amount)) throw errors.invalidInput('开票金额必须为整数分', 'amount')
    if (payload.amount <= 0) throw errors.negative('amount')

    const invoiceId = newId()
    const invoiceDate = today()
    const created = await db.transaction(async (tx) => {
      const current = await tx.queryOne<{ settle_total_amount: number }>({ text: 'SELECT settle_total_amount FROM settle_statements WHERE id = ?', params: [id] })
      const invoiced = await tx.queryOne<{ total: number }>({ text: 'SELECT COALESCE(SUM(amount), 0) AS total FROM invoices WHERE settlement_id = ?', params: [id] })
      const settleTotal = current?.settle_total_amount ?? statement.settle_total_amount
      const invoicedTotal = Number(invoiced?.total ?? 0)
      if (invoicedTotal + payload.amount! > settleTotal) throw errors.invoiceExceedTotal()
      await tx.run({
        text: 'INSERT INTO invoices (id, settlement_id, invoice_date, invoicer, invoice_no, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [invoiceId, id, invoiceDate, payload.invoicer!.trim(), payload.invoiceNo!.trim(), payload.amount, nowIso()],
      })
      await tx.run({ text: 'UPDATE settle_statements SET invoice_total_amount = ?, updated_at = ? WHERE id = ?', params: [invoicedTotal + payload.amount!, nowIso(), id] })
      await writeChangeLog(tx as unknown as DbClient, {
        entityType: 'settle_statement',
        entityId: id,
        changeType: '开票',
        before: { invoiceTotalAmount: invoicedTotal },
        after: { invoiceTotalAmount: invoicedTotal + payload.amount!, invoiceNo: payload.invoiceNo!.trim() },
        reason: '开票登记',
        operatorId: user.id,
      })
      return tx.queryOne<InvoiceRow>({ text: 'SELECT * FROM invoices WHERE id = ?', params: [invoiceId] })
    })
    await recordAuditEvent(auditKit, { action: '开票', entityType: 'settle_statement', entityId: id, actorUserId: user.id, metadata: { billNo: statement.bill_no, invoiceNo: payload.invoiceNo, amount: payload.amount } })
    return { statement: (await loadStatement(id)) as SettleStatementRow, invoice: created as InvoiceRow }
  }

  // 核销：前置存在有效开票记录；累计核销金额不超过累计开票金额
  async function recordWriteoff(user: AuthUser, id: string, payload: { amount?: number }): Promise<{ statement: SettleStatementRow; writeoff: WriteoffRow }> {
    const statement = await requireStatement(user, id)
    if (typeof payload.amount !== 'number' || !Number.isInteger(payload.amount)) throw errors.invalidInput('核销金额必须为整数分', 'amount')
    if (payload.amount <= 0) throw errors.negative('amount')

    const writeoffId = newId()
    const writeoffDate = today()
    const operator = user.name || user.email
    const created = await db.transaction(async (tx) => {
      const invoiced = await tx.queryOne<{ total: number }>({ text: 'SELECT COALESCE(SUM(amount), 0) AS total FROM invoices WHERE settlement_id = ?', params: [id] })
      const invoicedTotal = Number(invoiced?.total ?? 0)
      if (invoicedTotal <= 0) throw errors.noValidInvoice()
      const writtenOff = await tx.queryOne<{ total: number }>({ text: 'SELECT COALESCE(SUM(amount), 0) AS total FROM writeoffs WHERE settlement_id = ?', params: [id] })
      const writeoffTotal = Number(writtenOff?.total ?? 0)
      if (writeoffTotal + payload.amount! > invoicedTotal) throw errors.writeoffExceedInvoice()
      await tx.run({
        text: 'INSERT INTO writeoffs (id, settlement_id, writeoff_date, amount, operator, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        params: [writeoffId, id, writeoffDate, payload.amount, operator, nowIso()],
      })
      await tx.run({ text: 'UPDATE settle_statements SET writeoff_total_amount = ?, updated_at = ? WHERE id = ?', params: [writeoffTotal + payload.amount!, nowIso(), id] })
      await writeChangeLog(tx as unknown as DbClient, {
        entityType: 'settle_statement',
        entityId: id,
        changeType: '核销',
        before: { writeoffTotalAmount: writeoffTotal },
        after: { writeoffTotalAmount: writeoffTotal + payload.amount! },
        reason: '收款核销登记',
        operatorId: user.id,
      })
      return tx.queryOne<WriteoffRow>({ text: 'SELECT * FROM writeoffs WHERE id = ?', params: [writeoffId] })
    })
    await recordAuditEvent(auditKit, { action: '核销', entityType: 'settle_statement', entityId: id, actorUserId: user.id, metadata: { billNo: statement.bill_no, amount: payload.amount } })
    return { statement: (await loadStatement(id)) as SettleStatementRow, writeoff: created as WriteoffRow }
  }

  async function requireStatement(user: AuthUser, id: string): Promise<SettleStatementRow> {
    const statement = await loadStatement(id)
    if (!statement) throw errors.notFound('结算单不存在或不可见')
    assertCanAccessOrg(user, statement.org_id)
    return statement
  }

  return { list, detail, adjustSettleAmount, issueInvoice, recordWriteoff, loadStatement }
}

export type SettlementService = ReturnType<typeof createSettlementService>
