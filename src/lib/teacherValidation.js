export const MOBILE_PATTERN = /^1[3-9]\d{9}$/
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function toText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function getNameError(value) {
  return toText(value) ? null : '请输入教师名称'
}

export function getMobileError(value) {
  const mobile = toText(value)
  if (!mobile) return null
  return MOBILE_PATTERN.test(mobile) ? null : '请输入 11 位有效手机号，例如 13800138000'
}

export function getEmailError(value) {
  const email = toText(value)
  if (!email) return null
  return EMAIL_PATTERN.test(email) ? null : '请输入有效的邮箱地址，例如 teacher@school.com'
}

export function validateTeacherInput(input = {}) {
  const errors = {}
  const nameError = getNameError(input.name)
  if (nameError) errors.name = nameError
  const mobileError = getMobileError(input.mobile)
  if (mobileError) errors.mobile = mobileError
  const emailError = getEmailError(input.email)
  if (emailError) errors.email = emailError
  return errors
}

export function isTeacherInputValid(input) {
  return Object.keys(validateTeacherInput(input)).length === 0
}