/**
 * 访客登记与审批请求的字段级校验。
 *
 * 校验规则遵循 docs/wi-t1000396/technical-contract.md。
 * 校验失败由调用方返回 400 VALIDATION_ERROR，错误格式 {error:{code,message}}。
 */
import type { CreateVisitorRequest } from '../shared/visitor-types'

export interface ValidationResult<T> {
  ok: boolean
  value?: T
  message?: string
}

// 身证号校验：前 17 位为数字，第 18 位为校验位（0-9 或 X），按 GB 11643 加权算法计算。
const ID_CARD_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const ID_CARD_CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']

function isNonEmptyString(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.length >= 1 && value.length <= max
}

function isValidPhone(value: unknown): boolean {
  return typeof value === 'string' && /^1\d{10}$/.test(value)
}

function isValidIdCard(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{17}[\dXx]$/.test(value)) return false
  let sum = 0
  for (let i = 0; i < 17; i++) sum += Number(value[i]) * ID_CARD_WEIGHTS[i]
  return ID_CARD_CHECK_CODES[sum % 11] === value[17].toUpperCase()
}

function isValidIsoDateTime(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

function isValidUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return false
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

function fail<T>(message: string): ValidationResult<T> {
  return { ok: false, message }
}

/** 校验创建访客登记请求体，成功返回归一化后的 CreateVisitorRequest */
export function validateCreateVisitor(body: unknown): ValidationResult<CreateVisitorRequest> {
  if (body === null || typeof body !== 'object') {
    return fail('请求体不能为空')
  }
  const b = body as Record<string, unknown>

  if (!isNonEmptyString(b.name, 50)) return fail('访客姓名不能为空且不超过 50 字符')
  if (!isValidPhone(b.phone)) return fail('手机号必须为 11 位数字且以 1 开头')
  if (!isValidIdCard(b.idCard)) return fail('身份证号格式不合法')
  if (!isNonEmptyString(b.company, 100)) return fail('公司信息不能为空且不超过 100 字符')
  if (!isNonEmptyString(b.visitReason, 500)) return fail('访问事由不能为空且不超过 500 字符')
  if (!isNonEmptyString(b.hostName, 50)) return fail('被访人姓名不能为空且不超过 50 字符')
  if (!isValidIsoDateTime(b.expectedVisitTime)) return fail('预计到访时间必须是合法的 ISO 8601 日期时间')
  if (b.photoUrl !== undefined && b.photoUrl !== null && !isValidUrl(b.photoUrl)) {
    return fail('照片 URL 格式不合法')
  }

  return {
    ok: true,
    value: {
      name: b.name as string,
      phone: b.phone as string,
      idCard: b.idCard as string,
      company: b.company as string,
      visitReason: b.visitReason as string,
      hostName: b.hostName as string,
      expectedVisitTime: b.expectedVisitTime as string,
      photoUrl: b.photoUrl === undefined ? null : (b.photoUrl as string | null),
    },
  }
}

/** 校验审批请求体中的 comment 字段，成功返回归一化后的 { comment } */
export function validateReviewComment(body: unknown): ValidationResult<{ comment: string | null }> {
  if (body === null || typeof body !== 'object') {
    return { ok: true, value: { comment: null } }
  }
  const comment = (body as Record<string, unknown>).comment
  if (comment === undefined || comment === null) return { ok: true, value: { comment: null } }
  if (typeof comment !== 'string') return fail('审批意见必须为字符串')
  if (comment.length > 500) return fail('审批意见不能超过 500 字符')
  return { ok: true, value: { comment } }
}
