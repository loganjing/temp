// 枚举值中文标签（业务展示层统一来源；未匹配时回退原值）
export const ROLE_LABELS: Record<string, string> = {
  admin: '系统管理员',
  warehouse_ops: '仓储运营',
  finance: '财务',
  account_manager: '客户经理',
  auditor: '审核角色',
}

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: '暂存',
  effective: '已生效',
  terminated: '已终止',
}

export const RECEIVABLE_STATUS_LABELS: Record<string, string> = {
  draft: '暂存',
  reconciled: '已对账',
}

export const ADJUSTMENT_STATUS_LABELS: Record<string, string> = {
  draft: '暂存',
  effective: '已生效',
}

export const RECON_STATUS_LABELS: Record<string, string> = {
  draft: '暂存',
  approved: '审核通过',
}

export const SETTLE_STATUS_LABELS: Record<string, string> = {
  draft: '暂存',
}

export const BILLING_MODE_LABELS: Record<string, string> = {
  normal: '普通',
  fixed_price: '一口价',
  max_value: '取大值',
}

export const BILLING_BASIS_LABELS: Record<string, string> = {
  stock_qty: '按总库存数',
  locations: '按总库位数',
  volume: '按总体积',
  weight: '按总重量',
}

export const BILLING_PERIOD_LABELS: Record<string, string> = {
  daily: '按天（每日 0 点计费）',
  monthly: '按月（每月 1 日计费）',
}

export const SETTLEMENT_MODE_LABELS: Record<string, string> = {
  monthly: '月结',
  prepaid: '现付',
}

export const OWNER_TYPE_LABELS: Record<string, string> = {
  business: '业务组织',
  customer: '客户',
}

export const DISCOUNT_MODE_LABELS: Record<string, string> = {
  percent: '按百分比',
  fixed: '固定金额',
}

export const JOB_TYPE_LABELS: Record<string, string> = {
  'daily-billing': '按天计费任务',
  'monthly-billing': '按月计费任务',
  'contract-expiry': '合同过期检测任务',
}

export const JOB_STATUS_LABELS: Record<string, string> = {
  success: '成功',
  failed: '失败',
  skipped: '已跳过',
}

// 审计业务对象类型（服务端写入点实际使用的 entityType 值）
export const ENTITY_TYPE_LABELS: Record<string, string> = {
  quote: '仓储合同报价单',
  receivable: '应收费用明细',
  adjustment: '应收费用调整单',
  recon_statement: '应收对账单',
  settle_statement: '应收结算单',
  fee_type: '费用类型',
  goods_category: '货品类别',
  user: '用户',
}

export const USER_STATUS_LABELS: Record<string, string> = {
  active: '启用',
  disabled: '停用',
}

export const REPORT_TYPE_LABELS: Record<string, string> = {
  billing: '计费报表',
  recon: '对账报表',
  settlement: '结算报表',
}

export function labelOf(labels: Record<string, string>, value: string | null | undefined): string {
  if (!value) return '—'
  return labels[value] ?? value
}
