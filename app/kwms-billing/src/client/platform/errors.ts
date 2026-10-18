import { ApiRequestError } from './api-client'

// 错误码 → 中文提示（技术契约第 13 节错误码总表）。
// 服务端 message 已按中文模板输出，此处作为 code 兜底与前端第一道校验提示的统一文案来源。
export const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_REQUIRED: '存在必填项未填写',
  VALIDATION_DATE_ORDER: '合同开始日期必须早于结束日期',
  VALIDATION_FREE_RENT_END: '免租期结束日期不可晚于合同结束日期',
  VALIDATION_DUPLICATE_LINE: '同一组织、仓库、货主、效期内已存在同费用类型+同货品类别的生效明细',
  VALIDATION_DISCOUNT_OVERLAP: '分段优惠区间禁止交叉或断层，请调整业务量区间',
  VALIDATION_NEGATIVE: '禁止输入负数',
  VALIDATION_AMOUNT_EXCEED: '金额超出允许范围',
  ADJUSTMENT_NEGATIVE: '调整金额仅支持正数，调减请新增反向调整单',
  INVALID_STATUS: '当前单据状态不允许该操作',
  RECONCILED_LOCKED: '已对账明细禁止重算',
  CONTRACT_CONFLICT: '同一货主、仓库、周期已存在生效合同，请先终止旧合同',
  INVOICE_EXCEED_TOTAL: '累计开票金额不可超过结算总金额',
  NO_VALID_INVOICE: '无有效开票记录，不可核销',
  WRITEOFF_EXCEED_INVOICE: '累计核销金额不可超过累计开票金额',
  PERMISSION_DENIED: '当前角色无权执行该操作',
  ORG_FORBIDDEN: '禁止跨组织访问数据',
  UNAUTHENTICATED: '未登录或会话已失效',
  NOT_FOUND: '单据不存在或不可见',
  NETWORK_ERROR: '无法连接服务，请检查网络后重试',
}

export function messageOfCode(code: string): string {
  return ERROR_MESSAGES[code] ?? code
}

// 把任意异常转为中文提示：优先服务端 message，其次错误码映射。
export function errorText(error: unknown, fallback = '操作失败，请稍后重试'): string {
  if (error instanceof ApiRequestError) {
    if (error.message && !/^请求失败|^HTTP /.test(error.message)) return error.message
    if (error.code) return messageOfCode(error.code)
    return fallback
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export function isPermissionDenied(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.code === 'PERMISSION_DENIED' || error.code === 'FORBIDDEN' || error.status === 403)
}
