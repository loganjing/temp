import type { TeacherFormData } from './types'

export interface ValidationErrors {
  name?: string
  course?: string
  grade?: string
  phone?: string
  email?: string
}

/** 校验手机号：基本格式（11位数字，以1开头） */
export function validatePhone(phone: string): string | undefined {
  if (!phone) return undefined // 手机非必填，空值通过
  if (!/^1\d{10}$/.test(phone)) {
    return '请输入有效的手机号（11位数字，以1开头）'
  }
  return undefined
}

/** 校验邮箱：基本格式（包含 @ 和域名） */
export function validateEmail(email: string): string | undefined {
  if (!email) return undefined // 邮箱非必填，空值通过
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return '请输入有效的邮箱地址'
  }
  return undefined
}

/** 校验全部表单字段，返回错误映射 */
export function validateTeacher(data: TeacherFormData): ValidationErrors {
  const errors: ValidationErrors = {}

  if (!data.name.trim()) {
    errors.name = '教师名称为必填项'
  }
  if (!data.course.trim()) {
    errors.course = '教授课程为必填项'
  }
  if (!data.grade.trim()) {
    errors.grade = '年级为必填项'
  }

  const phoneError = validatePhone(data.phone)
  if (phoneError) errors.phone = phoneError

  const emailError = validateEmail(data.email)
  if (emailError) errors.email = emailError

  return errors
}
