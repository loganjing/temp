import { ERROR_CODES } from '../../shared/contracts'

// 业务错误：路由层统一转换为技术契约第 13 节错误结构 {error:{code,message,field?}}
export class BusinessError extends Error {
  readonly code: string
  readonly status: number
  readonly field?: string

  constructor(code: string, message: string, status = 400, field?: string) {
    super(message)
    this.name = 'BusinessError'
    this.code = code
    this.status = status
    this.field = field
  }
}

export const errors = {
  required: (field: string) => new BusinessError(ERROR_CODES.VALIDATION_REQUIRED, `${field}为必填项`, 400, field),
  dateOrder: () => new BusinessError(ERROR_CODES.VALIDATION_DATE_ORDER, '合同开始日期必须早于结束日期', 400, 'effectStart'),
  freeRentEnd: () => new BusinessError(ERROR_CODES.VALIDATION_FREE_RENT_END, '免租期结束日期不可晚于合同结束日期', 400, 'rentFreeDays'),
  duplicateLine: () => new BusinessError(ERROR_CODES.VALIDATION_DUPLICATE_LINE, '同一组织、仓库、货主、效期内已存在同费用类型+同货品类别的生效明细', 400),
  discountOverlap: () => new BusinessError(ERROR_CODES.VALIDATION_DISCOUNT_OVERLAP, '分段优惠区间禁止交叉或断层，请调整业务量区间', 400),
  negative: (field?: string) => new BusinessError(ERROR_CODES.VALIDATION_NEGATIVE, '禁止输入负数', 400, field),
  amountExceed: (message = '金额超出允许范围') => new BusinessError(ERROR_CODES.VALIDATION_AMOUNT_EXCEED, message, 400),
  adjustmentNegative: () => new BusinessError(ERROR_CODES.ADJUSTMENT_NEGATIVE, '调整金额仅支持正数，调减请新增反向调整单', 400, 'adjustmentAmount'),
  invalidStatus: (message = '当前单据状态不允许该操作') => new BusinessError(ERROR_CODES.INVALID_STATUS, message, 409),
  reconciledLocked: () => new BusinessError(ERROR_CODES.RECONCILED_LOCKED, '已对账明细禁止重算', 409),
  contractConflict: () => new BusinessError(ERROR_CODES.CONTRACT_CONFLICT, '同一货主、仓库、周期已存在生效合同，请先终止旧合同', 409),
  invoiceExceedTotal: () => new BusinessError(ERROR_CODES.INVOICE_EXCEED_TOTAL, '累计开票金额不可超过结算总金额', 409),
  noValidInvoice: () => new BusinessError(ERROR_CODES.NO_VALID_INVOICE, '无有效开票记录，不可核销', 409),
  writeoffExceedInvoice: () => new BusinessError(ERROR_CODES.WRITEOFF_EXCEED_INVOICE, '累计核销金额不可超过累计开票金额', 409),
  permissionDenied: () => new BusinessError(ERROR_CODES.PERMISSION_DENIED, '当前角色无权执行该操作', 403),
  orgForbidden: () => new BusinessError(ERROR_CODES.ORG_FORBIDDEN, '禁止跨组织访问数据', 403),
  unauthenticated: (message = '用户名或密码错误') => new BusinessError(ERROR_CODES.UNAUTHENTICATED, message, 401),
  notFound: (message = '单据不存在或不可见') => new BusinessError(ERROR_CODES.NOT_FOUND, message, 404),
  invalidInput: (message: string, field?: string) => new BusinessError('INVALID_INPUT', message, 400, field),
}
