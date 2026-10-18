// API 类型定义：字段级契约（docs/wi-t1000065/technical-contract.md）+ 服务端实际响应结构。
// 金额字段一律整数「分」；按角色可见性策略，非财务角色的金额字段可能为 null。
import type {
  AdjustmentStatus,
  BillingBasis,
  BillingMode,
  BillingPeriod,
  DiscountMode,
  JobType,
  OwnerType,
  QuoteStatus,
  ReceivableStatus,
  ReconStatus,
  SettlementMode,
} from '../shared/contracts'

export type NullableAmount = number | null

// —— 通用 ——
export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

// —— 会话 ——
export interface SessionUser {
  id: string
  username: string
  name: string
  orgId: string | null
  roles: string[]
  passwordChangeRequired?: boolean | null
}
export interface LoginResponse {
  token: string
  user: SessionUser
}
export interface MeResponse {
  user: SessionUser
  permissions: string[]
}

// —— 主数据（组织/仓库/货主/合同/基础档案） ——
export interface OrgRef { id: string; code: string; name: string }
export interface WarehouseRef { id: string; orgId: string; code: string; name: string; status: string }
export interface OwnerRef { id: string; orgId: string; ownerType: string; code: string; name: string }
export interface ContractRef { id: string; orgId: string; contractNo: string; status: string }
export interface CatalogRef { id: string; code: string; name: string }

// —— 仓储合同报价单（CCHT） ——
export interface DiscountRule {
  lowerLimit: number
  upperLimit: number
  discountMode: DiscountMode
  percentValue?: number | null
  fixedValue?: number | null
}
export interface QuoteLine {
  id: string
  lineNo: number
  feeTypeId: string
  billingMode: BillingMode
  billingBasis: BillingBasis | null
  goodsCategoryId: string | null
  unitPrice: NullableAmount
  minCharge: NullableAmount
  fixedAmount: NullableAmount
  discounts: DiscountRule[]
}
export interface Quote {
  id: string
  billNo: string
  contractId: string
  contractNo: string
  orgId: string
  warehouseId: string
  ownerType: OwnerType
  ownerId: string
  effectStart: string
  effectEnd: string
  rentFreeDays: number
  billingPeriod: BillingPeriod
  settlementMode: SettlementMode
  insuranceRequired: boolean
  status: QuoteStatus
  remark: string | null
  createdAt: string
  updatedAt: string
}
export interface QuoteDetailResponse extends Quote {
  lines: QuoteLine[]
}

// —— 应收费用明细 ——
export interface ReceivableDetail {
  id: string
  billDate: string
  orgId: string
  warehouseId: string
  ownerId: string
  feeTypeId: string
  goodsCategoryId: string | null
  billingMode: BillingMode
  billingBasis: BillingBasis | null
  businessQty: number
  rawAmount: NullableAmount
  discountedAmount: NullableAmount
  minCharge: NullableAmount
  finalAmount: NullableAmount
  quoteBillNo: string
  status: ReceivableStatus
  createdAt: string
}
export interface RecalcResponse {
  recalculated: number
  skipped: Array<{ id: string; reason: string }>
}

// —— 应收费用调整单（YSTZ） ——
export interface Adjustment {
  id: string
  billNo: string
  orgId: string
  periodStart: string
  periodEnd: string
  status: AdjustmentStatus
  remark: string | null
  createdAt: string
  updatedAt: string
}
export interface AdjustmentLine {
  id: string
  lineNo: number
  receivableDetailId: string | null
  feeTypeId: string
  businessQty: number | null
  amountBefore: NullableAmount
  adjustmentAmount: NullableAmount
  amountAfter: NullableAmount
  reason: string | null
}
export interface AdjustmentDetailResponse extends Adjustment {
  lines: AdjustmentLine[]
}

// —— 应收对账单（YSDZ） ——
export interface ReconStatement {
  id: string
  billNo: string
  orgId: string
  warehouseId: string
  ownerId: string
  periodStart: string
  periodEnd: string
  totalAmount: NullableAmount
  lineCount: number
  status: ReconStatus
  remark: string | null
  createdAt: string
  auditedAt: string | null
}
export interface ReconLine {
  id: string
  lineNo: number
  receivableDetailId: string
  goodsCategoryId: string | null
  billDate: string
  feeTypeId: string
  billingMode: BillingMode
  businessQty: number
  unitPrice: NullableAmount
  minCharge: NullableAmount
  rawAmount: NullableAmount
  finalAmount: NullableAmount
}
export interface ReconDetailResponse extends ReconStatement {
  lines: ReconLine[]
}

// —— 应收结算单（YSJS；契约第 8 节路径 /api/settle-statements） ——
export interface Settlement {
  id: string
  billNo: string
  reconStatementId: string
  orgId: string
  warehouseId: string
  ownerId: string
  reconTotalAmount: NullableAmount
  settleTotalAmount: NullableAmount
  invoiceTotalAmount: NullableAmount
  writeoffTotalAmount: NullableAmount
  status: string
  createdAt: string
  updatedAt: string
}
export interface Invoice {
  id: string
  settlementId: string
  invoiceDate: string
  invoicer: string
  invoiceNo: string
  amount: NullableAmount
  createdAt: string
}
export interface Writeoff {
  id: string
  settlementId: string
  writeoffDate: string
  amount: NullableAmount
  operator: string
  createdAt: string
}
// 结算单费用明细为对账明细快照（服务端序列化为 camelCase，与对账明细行同构）
export interface SettlementLine {
  id: string
  receivableDetailId: string
  goodsCategoryId: string | null
  billDate: string
  feeTypeId: string
  billingMode: string
  businessQty: number
  unitPrice: NullableAmount
  minCharge: NullableAmount
  rawAmount: NullableAmount
  finalAmount: NullableAmount
}
export interface SettlementDetailResponse extends Settlement {
  invoices: Invoice[]
  writeoffs: Writeoff[]
  lines: SettlementLine[]
}

// —— 定时任务 ——
export interface JobRun {
  id: string
  jobType: JobType | string
  targetDate: string
  status: string
  generatedCount: number
  affectedCount: number
  failedCount: number
  errorMessage: string | null
  startedAt: string
  finishedAt: string | null
}
export interface JobRunSummary {
  jobRunId: string
  jobType: JobType
  targetDate: string
  status: string
  generatedCount: number
  affectedCount: number
  failedCount: number
  errors: Array<{ orgId: string; warehouseId: string; ownerId: string; message: string }>
}

// —— 审计与变更日志 ——
export interface AuditEvent {
  id: string
  operatorName: string | null
  operatedAt: string
  action: string
  entityType: string
  entityId: string
}
export interface ChangeLog {
  id: string
  changeType: string
  before: unknown
  after: unknown
  reason: string | null
  operatorName: string | null
  operatedAt: string
  entityType: string
  entityId: string
}

// —— 用户管理（技术契约第 12 节） ——
export interface ManagedUser {
  id: string
  username: string
  name: string
  roles: string[]
  orgId: string | null
  status: string
}
export interface RoleRef {
  key: string
  name: string
}
