/**
 * 表单校验模块
 * 校验教师名称（必填）、手机号格式、邮箱格式
 */

/**
 * 校验教师表单数据
 * @param {{name:string,course:string,grade:string,phone:string,email:string}} data
 * @returns {{valid:boolean,errors:Record<string,string>}} 校验结果
 */
export function validateTeacher(data) {
  const errors = {}

  // 教师名称 - 必填
  if (!data.name || !data.name.trim()) {
    errors.name = '教师名称为必填项'
  }

  // 手机号 - 基本格式校验（数字为主，长度合理）
  if (data.phone && data.phone.trim()) {
    if (!isValidPhone(data.phone.trim())) {
      errors.phone = '手机号格式不正确（应为 11 位数字）'
    }
  }

  // 邮箱 - 基本格式校验（包含 @ 及合理域名结构）
  if (data.email && data.email.trim()) {
    if (!isValidEmail(data.email.trim())) {
      errors.email = '邮箱格式不正确'
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  }
}

/**
 * 校验手机号格式
 * 支持中国手机号格式：1 开头的 11 位数字
 */
function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone)
}

/**
 * 校验邮箱格式
 * 要求包含 @ 及合理域名结构
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
