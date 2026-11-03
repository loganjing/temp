/**
 * 教师字段校验工具
 */

/**
 * 校验教师名称（必填）
 * @param {string} name
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateName(name) {
  const trimmed = (name || '').trim()
  if (!trimmed) {
    return { valid: false, error: '教师名称为必填项' }
  }
  return { valid: true }
}

/**
 * 校验手机号（选填，填写时做轻量格式校验）
 * 推荐基线：常见手机号格式（11位数字，以1开头）
 * @param {string} phone
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePhone(phone) {
  const trimmed = (phone || '').trim()
  if (!trimmed) {
    return { valid: true }
  }
  if (!/^1\d{10}$/.test(trimmed)) {
    return { valid: false, error: '手机号格式不正确（应为11位数字，以1开头）' }
  }
  return { valid: true }
}

/**
 * 校验邮箱（选填，填写时做轻量格式校验）
 * 推荐基线：常见邮箱格式
 * @param {string} email
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateEmail(email) {
  const trimmed = (email || '').trim()
  if (!trimmed) {
    return { valid: true }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { valid: false, error: '邮箱格式不正确' }
  }
  return { valid: true }
}

/**
 * 校验整条教师记录
 * @param {{ name: string, course: string, grade: string, phone: string, email: string }} teacher
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateTeacher(teacher) {
  const errors = {}

  const nameResult = validateName(teacher.name)
  if (!nameResult.valid) {
    errors.name = nameResult.error
  }

  const phoneResult = validatePhone(teacher.phone)
  if (!phoneResult.valid) {
    errors.phone = phoneResult.error
  }

  const emailResult = validateEmail(teacher.email)
  if (!emailResult.valid) {
    errors.email = emailResult.error
  }

  return { valid: Object.keys(errors).length === 0, errors }
}
