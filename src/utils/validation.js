/**
 * 表单校验工具
 * 校验规则：所有字段必填，手机号为有效数字格式，邮箱需包含 @ 和域名
 */

const PHONE_REGEX = /^1[3-9]\d{9}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * 校验教师表单数据
 * @param {Object} data - { name, courses, grade, phone, email }
 * @returns {Object} errors - 每个字段的错误信息，空对象表示无错误
 */
export function validateTeacher(data) {
  const errors = {}

  if (!data.name || !data.name.trim()) {
    errors.name = '教师名称不能为空'
  }

  if (!data.courses || !data.courses.trim()) {
    errors.courses = '教授课程不能为空'
  }

  if (!data.grade || !data.grade.trim()) {
    errors.grade = '年级不能为空'
  }

  if (!data.phone || !data.phone.trim()) {
    errors.phone = '手机号不能为空'
  } else if (!PHONE_REGEX.test(data.phone.trim())) {
    errors.phone = '请输入有效的手机号码（如 13800138000）'
  }

  if (!data.email || !data.email.trim()) {
    errors.email = '邮箱不能为空'
  } else if (!EMAIL_REGEX.test(data.email.trim())) {
    errors.email = '请输入有效的邮箱地址（如 teacher@example.com）'
  }

  return errors
}
