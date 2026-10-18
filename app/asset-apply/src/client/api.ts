import { apiRequest } from './platform/api-client'

/**
 * 资产领用单客户端消费类型与请求函数。
 *
 * 请求体字段保持技术契约（docs/wi-t1000064/technical-contract.md §2）的 snake_case wire 键；
 * 响应经 platform/api-client 的 wire 规范化后键名为 camelCase（pick_date → pickDate、
 * asset_name → assetName；billno、createtime、modifierfield、modifydatefield 等无下划线键不变）。
 */

/** POST /api/asset-apply-bills 请求体（契约 §2）。 */
export interface BillEntryDraft {
  asset_name: string
  asset_code: string
  spec_model: string
  qty: number
  unit: string
  location: string
  line_remark: string
}

export interface BillDraft {
  pick_date: string
  picker: string
  pick_dept: string
  org: string
  purpose: string
  remark: string
  entries: BillEntryDraft[]
}

/** GET /api/asset-apply-bills/:id 响应（规范化后）。 */
export interface BillEntry {
  id: number
  seq: number
  assetName: string
  assetCode: string | null
  specModel: string | null
  qty: number
  unit: string | null
  location: string | null
  lineRemark: string | null
  modifierfield: string
  modifydatefield: string
}

export interface Bill {
  id: number
  billno: string
  pickDate: string
  picker: string
  pickDept: string
  org: string
  purpose: string | null
  remark: string | null
  billstatus: string
  creator: string
  createtime: string
  modifier: string
  modifytime: string
  auditor: string | null
  auditdate: string | null
  entries: BillEntry[]
}

/** GET /api/asset-apply-bills 列表项摘要（契约 §3，不含 purpose/remark/auditor/auditdate/分录）。 */
export interface BillSummary {
  id: number
  billno: string
  pickDate: string
  picker: string
  pickDept: string
  org: string
  billstatus: string
  createtime: string
  modifier: string
  modifytime: string
}

export interface BillListResult {
  items: BillSummary[]
  total: number
  page: number
  pageSize: number
}

export interface BillListQuery {
  billno?: string
  picker?: string
  pick_date?: string
  page?: number
  pageSize?: number
}

export function createBill(draft: BillDraft): Promise<Bill> {
  return apiRequest<Bill>('/api/asset-apply-bills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  })
}

export function listBills(query: BillListQuery): Promise<BillListResult> {
  const params = new URLSearchParams()
  if (query.billno?.trim()) params.set('billno', query.billno.trim())
  if (query.picker?.trim()) params.set('picker', query.picker.trim())
  if (query.pick_date) params.set('pick_date', query.pick_date)
  params.set('page', String(query.page ?? 1))
  params.set('pageSize', String(query.pageSize ?? 20))
  return apiRequest<BillListResult>(`/api/asset-apply-bills?${params.toString()}`)
}

export function getBill(id: string): Promise<Bill> {
  return apiRequest<Bill>(`/api/asset-apply-bills/${id}`)
}
