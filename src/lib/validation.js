/**
 * 教师表单校验
 * 校验规则基线：
 * - 教师名称：不为空
 * - 手机：合理电话号码格式（数字为主，长度合理，7-15位）
 * - 邮箱：包含 @ 且有有效域名部分
 */

/**
 * 校验教师信息
 * @param {{ teacherName: string, course: string, grade: string, phone: string, email: string }} data
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateTeacher(data) {
  const errors = {}

  // 教师名称不为空
  if (!data.teacherName || !data.teacherName.trim()) {
    errors.teacherName = '教师名称不能为空'
  }

  // 手机号格式校验：数字为主，允许 +/-/空格/括号，长度 7-15 位数字
  const phoneDigits = (data.phone || '').replace(/[\s\-()+]/g, '')
  if (!data.phone || !data.phone.trim()) {
    errors.phone = '手机号不能为空'
  } else if (!/^\d{7,15}$/.test(phoneDigits)) {
    errors.phone = '手机号格式不正确（应为 7-15 位数字）'
  }

  // 邮箱格式校验：包含 @ 且有有效域名部分
  const email = (data.email || '').trim()
  if (!email) {
    errors.email = '邮箱不能为空'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = '邮箱格式不正确（应包含 @ 和有效域名）'
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  }
}
