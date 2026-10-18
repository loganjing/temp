import type { DbClient } from '@commonapp/dbkit'
import type { AuthUser } from '@commonapp/userkit'
import * as XLSX from 'xlsx'
import { errors } from '../common/errors'
import type { OrgScope } from '../common/scope'

// reports 域：计费/对账/结算 Excel 报表导出（按货主、仓库、业务周期），
// xlsx 服务端生成，行内容由对应单据只读聚合；参数缺省按全量（限本组织）。

export type ReportType = 'billing' | 'recon' | 'settlement'

export interface ReportFilters {
  ownerId?: string | null
  warehouseId?: string | null
  periodStart?: string | null
  periodEnd?: string | null
}

const MONEY_HEADERS = ['原始计算金额(元)', '优惠后计费金额(元)', '最低收费(元)', '最终计费金额(元)']

function centsToYuan(cents: number | null): number | null {
  if (cents === null || cents === undefined) return null
  return Math.round(cents) / 100
}

export function createReportsService(db: DbClient) {
  async function resolveNames(): Promise<{ warehouses: Map<string, string>; owners: Map<string, string>; feeTypes: Map<string, string>; goodsCategories: Map<string, string>; orgs: Map<string, string> }> {
    const [warehouses, owners, feeTypes, goodsCategories, orgs] = await Promise.all([
      db.queryAll<{ id: string; name: string }>({ text: 'SELECT id, name FROM warehouses' }),
      db.queryAll<{ id: string; name: string }>({ text: 'SELECT id, name FROM owners' }),
      db.queryAll<{ id: string; name: string }>({ text: 'SELECT id, name FROM fee_types' }),
      db.queryAll<{ id: string; name: string }>({ text: 'SELECT id, name FROM goods_categories' }),
      db.queryAll<{ id: string; name: string }>({ text: 'SELECT id, name FROM organizations' }),
    ])
    const toMap = (rows: Array<{ id: string; name: string }>) => new Map(rows.map((row) => [row.id, row.name]))
    return {
      warehouses: toMap(warehouses),
      owners: toMap(owners),
      feeTypes: toMap(feeTypes),
      goodsCategories: toMap(goodsCategories),
      orgs: toMap(orgs),
    }
  }

  async function billingRows(scope: OrgScope, filters: ReportFilters): Promise<string[][]> {
    const conditions: string[] = ['1 = 1']
    const params: unknown[] = []
    if (!scope.isAdmin && scope.orgId) {
      conditions.push('r.org_id = ?')
      params.push(scope.orgId)
    }
    if (filters.ownerId) {
      conditions.push('r.owner_id = ?')
      params.push(filters.ownerId)
    }
    if (filters.warehouseId) {
      conditions.push('r.warehouse_id = ?')
      params.push(filters.warehouseId)
    }
    if (filters.periodStart) {
      conditions.push('r.bill_date >= ?')
      params.push(filters.periodStart)
    }
    if (filters.periodEnd) {
      conditions.push('r.bill_date <= ?')
      params.push(filters.periodEnd)
    }
    const rows = await db.queryAll<{
      bill_date: string
      org_id: string
      warehouse_id: string
      owner_id: string
      fee_type_id: string
      goods_category_id: string | null
      billing_mode: string | null
      billing_basis: string | null
      business_qty: number | null
      raw_amount: number | null
      discounted_amount: number | null
      min_charge: number | null
      final_amount: number | null
      quote_bill_no: string
      status: string
    }>({
      text: `SELECT r.bill_date, r.org_id, r.warehouse_id, r.owner_id, r.fee_type_id, r.goods_category_id, r.billing_mode, r.billing_basis,
                    r.business_qty, r.raw_amount, r.discounted_amount, r.min_charge, r.final_amount, r.quote_bill_no, r.status
             FROM receivable_details r WHERE ${conditions.join(' AND ')} ORDER BY r.bill_date, r.id`,
      params,
    })
    const names = await resolveNames()
    return rows.map((row) => [
      row.bill_date,
      names.orgs.get(row.org_id) ?? row.org_id,
      names.warehouses.get(row.warehouse_id) ?? row.warehouse_id,
      names.owners.get(row.owner_id) ?? row.owner_id,
      names.feeTypes.get(row.fee_type_id) ?? row.fee_type_id,
      row.goods_category_id ? names.goodsCategories.get(row.goods_category_id) ?? row.goods_category_id : '全货品',
      row.billing_mode ?? '',
      row.billing_basis ?? '',
      String(row.business_qty ?? ''),
      String(centsToYuan(row.raw_amount ?? 0) ?? ''),
      String(centsToYuan(row.discounted_amount ?? 0) ?? ''),
      String(centsToYuan(row.min_charge ?? null) ?? ''),
      String(centsToYuan(row.final_amount ?? 0) ?? ''),
      row.quote_bill_no,
      row.status === 'reconciled' ? '已对账' : '暂存',
    ])
  }

  async function reconRows(scope: OrgScope, filters: ReportFilters): Promise<string[][]> {
    const conditions: string[] = ['1 = 1']
    const params: unknown[] = []
    if (!scope.isAdmin && scope.orgId) {
      conditions.push('s.org_id = ?')
      params.push(scope.orgId)
    }
    if (filters.ownerId) {
      conditions.push('s.owner_id = ?')
      params.push(filters.ownerId)
    }
    if (filters.warehouseId) {
      conditions.push('s.warehouse_id = ?')
      params.push(filters.warehouseId)
    }
    if (filters.periodStart) {
      conditions.push('s.period_start >= ?')
      params.push(filters.periodStart)
    }
    if (filters.periodEnd) {
      conditions.push('s.period_end <= ?')
      params.push(filters.periodEnd)
    }
    const rows = await db.queryAll<{
      bill_no: string
      period_start: string
      period_end: string
      org_id: string
      warehouse_id: string
      owner_id: string
      total_amount: number
      line_count: number
      status: string
      remark: string | null
    }>({
      text: `SELECT s.bill_no, s.period_start, s.period_end, s.org_id, s.warehouse_id, s.owner_id, s.total_amount, s.line_count, s.status, s.remark
             FROM recon_statements s WHERE ${conditions.join(' AND ')} ORDER BY s.created_at`,
      params,
    })
    const names = await resolveNames()
    return rows.map((row) => [
      row.bill_no,
      row.period_start,
      row.period_end,
      names.orgs.get(row.org_id) ?? row.org_id,
      names.warehouses.get(row.warehouse_id) ?? row.warehouse_id,
      names.owners.get(row.owner_id) ?? row.owner_id,
      String(centsToYuan(row.total_amount ?? 0) ?? ''),
      String(row.line_count ?? 0),
      row.status === 'approved' ? '审核通过' : '暂存',
      row.remark ?? '',
    ])
  }

  async function settlementRows(scope: OrgScope, filters: ReportFilters): Promise<string[][]> {
    const conditions: string[] = ['1 = 1']
    const params: unknown[] = []
    if (!scope.isAdmin && scope.orgId) {
      conditions.push('s.org_id = ?')
      params.push(scope.orgId)
    }
    if (filters.ownerId) {
      conditions.push('s.owner_id = ?')
      params.push(filters.ownerId)
    }
    if (filters.warehouseId) {
      conditions.push('s.warehouse_id = ?')
      params.push(filters.warehouseId)
    }
    if (filters.periodStart) {
      conditions.push('s.created_at >= ?')
      params.push(filters.periodStart)
    }
    if (filters.periodEnd) {
      conditions.push('s.created_at <= ?')
      params.push(filters.periodEnd)
    }
    const rows = await db.queryAll<{
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
    }>({
      text: `SELECT s.bill_no, s.recon_statement_id, s.org_id, s.warehouse_id, s.owner_id, s.recon_total_amount, s.settle_total_amount,
                    s.invoice_total_amount, s.writeoff_total_amount, s.status, s.created_at
             FROM settle_statements s WHERE ${conditions.join(' AND ')} ORDER BY s.created_at`,
      params,
    })
    const names = await resolveNames()
    return rows.map((row) => [
      row.bill_no,
      names.orgs.get(row.org_id) ?? row.org_id,
      names.warehouses.get(row.warehouse_id) ?? row.warehouse_id,
      names.owners.get(row.owner_id) ?? row.owner_id,
      String(centsToYuan(row.recon_total_amount ?? 0) ?? ''),
      String(centsToYuan(row.settle_total_amount ?? 0) ?? ''),
      String(centsToYuan(row.invoice_total_amount ?? 0) ?? ''),
      String(centsToYuan(row.writeoff_total_amount ?? 0) ?? ''),
      row.status === 'draft' ? '暂存' : row.status,
      String(row.created_at ?? ''),
    ])
  }

  const HEADERS: Record<ReportType, string[]> = {
    billing: ['记账日期', '组织机构', '仓库名称', '货主', '费用类型', '货品类别', '计费模式', '计费方式', '业务量', ...MONEY_HEADERS, '关联合同单号', '单据状态'],
    recon: ['单据编号', '业务周期开始', '业务周期结束', '组织机构', '仓库名称', '结算方（货主）', '总金额(元)', '明细行数', '单据状态', '备注'],
    settlement: ['单据编号', '组织机构', '仓库名称', '结算方（货主）', '对账总金额(元)', '结算总金额(元)', '开票总金额(元)', '核销总金额(元)', '单据状态', '创建时间'],
  }

  function buildWorkbook(type: ReportType, rows: string[][]): XLSX.WorkBook {
    const sheet = XLSX.utils.aoa_to_sheet([HEADERS[type], ...rows])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, '报表')
    return workbook
  }

  async function exportReport(user: AuthUser, scope: OrgScope, type: string, filters: ReportFilters): Promise<{ buffer: Buffer; filename: string }> {
    let rows: string[][]
    switch (type) {
      case 'billing': rows = await billingRows(scope, filters); break
      case 'recon': rows = await reconRows(scope, filters); break
      case 'settlement': rows = await settlementRows(scope, filters); break
      default: throw errors.invalidInput('报表类型取值无效（billing|recon|settlement）', 'type')
    }
    const workbook = buildWorkbook(type as ReportType, rows)
    const buffer = XLSX.write(workbook, { type: 'buffer' }) as Buffer
    return { buffer, filename: `${type}-report-${new Date().toISOString().slice(0, 10)}.xlsx` }
  }

  return { exportReport }
}

export type ReportsService = ReturnType<typeof createReportsService>
