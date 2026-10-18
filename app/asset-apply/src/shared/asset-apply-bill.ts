// 资产领用单平台中立契约：单据类型、错误码与提示文案。
// 字段级唯一来源为 docs/wi-t1000064/technical-contract.md，服务端与前端共同消费。
// 系统字段（billno、creator、createtime、modifier、modifytime、分录 modifierfield/modifydatefield）
// 由服务端生成，前端不得提交。

export const ASSET_APPLY_BILL_ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BILL_NOT_FOUND: 'BILL_NOT_FOUND',
  BILLNO_CONFLICT: 'BILLNO_CONFLICT',
} as const

export type AssetApplyBillErrorCode = (typeof ASSET_APPLY_BILL_ERROR_CODES)[keyof typeof ASSET_APPLY_BILL_ERROR_CODES]

// 校验与错误文案；前端预检必须使用同一文案，保证用户可见反馈一致。
export const ASSET_APPLY_BILL_MESSAGES = {
  VALIDATION_SUMMARY: '保存校验未通过',
  ENTRIES_REQUIRED: '明细分录不能为空',
  ASSET_NAME_REQUIRED: '资产名称不能为空',
  QTY_REQUIRED: '数量不能为空',
  PICK_DATE_REQUIRED: '领用日期不能为空',
  PICK_DATE_INVALID: '领用日期格式不正确，应为 yyyy-MM-dd',
  PICKER_REQUIRED: '领用人不能为空',
  PICK_DEPT_REQUIRED: '领用部门不能为空',
  ORG_REQUIRED: '组织不能为空',
  BILL_NOT_FOUND: '领用单不存在',
  BILLNO_CONFLICT: '领用单号冲突，请稍后重试',
} as const

/** 明细分录（完整回读形态，字段与列同名） */
export interface AssetApplyBillEntry {
  id: number
  seq: number
  asset_name: string
  asset_code: string | null
  spec_model: string | null
  qty: number
  unit: string | null
  location: string | null
  line_remark: string | null
  modifierfield: string
  modifydatefield: string
}

/** 领用单完整单据（POST 响应与 GET /:id 响应共用） */
export interface AssetApplyBill {
  id: number
  billno: string
  pick_date: string
  picker: string
  pick_dept: string
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
  entries: AssetApplyBillEntry[]
}

/** 列表摘要（不含 purpose/remark/auditor/auditdate 与分录） */
export interface AssetApplyBillSummary {
  id: number
  billno: string
  pick_date: string
  picker: string
  pick_dept: string
  org: string
  billstatus: string
  createtime: string
  modifier: string
  modifytime: string
}

/** 条件查询结果（按 createtime 降序分页） */
export interface AssetApplyBillListResult {
  items: AssetApplyBillSummary[]
  total: number
  page: number
  pageSize: number
}

/** 创建请求的分录行（可选字段可空串，服务端视为 NULL） */
export interface CreateAssetApplyBillEntryInput {
  asset_name: string
  asset_code?: string
  spec_model?: string
  qty: number
  unit?: string
  location?: string
  line_remark?: string
}

/** 创建请求体（系统字段一律由服务端生成，请求中出现时忽略） */
export interface CreateAssetApplyBillInput {
  pick_date: string
  picker: string
  pick_dept: string
  org: string
  purpose?: string
  remark?: string
  entries: CreateAssetApplyBillEntryInput[]
}

/** 条件查询（billno/picker 包含匹配、pick_date 精确；page 默认 1，pageSize 默认 20 上限 100） */
export interface AssetApplyBillListQuery {
  billno?: string
  picker?: string
  pick_date?: string
  page: number
  pageSize: number
}

/** 统一错误结构中的字段级定位项 */
export interface ApiErrorDetail {
  path: string
  message: string
}

/** 统一错误结构：沿用平台 {error:{code,message}} 形状，details 为字段级扩展 */
export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: ApiErrorDetail[]
  }
}
