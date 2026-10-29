const PHONE_REGEX = /^1[3-9]\d{9}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateTeacher(data) {
  const errors = {}

  if (!data.name || !data.name.trim()) {
    errors.name = '教师名称不能为空'
  }

  if (!data.course || !data.course.trim()) {
    errors.course = '教授课程不能为空'
  }

  if (!data.grade || !data.grade.trim()) {
    errors.grade = '年级不能为空'
  }

  if (!data.phone || !data.phone.trim()) {
    errors.phone = '手机号码不能为空'
  } else if (!PHONE_REGEX.test(data.phone.trim())) {
    errors.phone = '手机号码格式不正确（需为11位有效手机号）'
  }

  if (!data.email || !data.email.trim()) {
    errors.email = '邮箱不能为空'
  } else if (!EMAIL_REGEX.test(data.email.trim())) {
    errors.email = '邮箱格式不正确'
  }

  return errors
}

export function isAllFieldsValid(data) {
  return Object.keys(validateTeacher(data)).length === 0
}
