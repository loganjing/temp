export const FIELDS = [
  { key: 'name', label: '教师名称', type: 'text', required: true },
  { key: 'course', label: '教授课程', type: 'text', required: true },
  { key: 'grade', label: '年级', type: 'text', required: true },
  { key: 'phone', label: '手机', type: 'text', required: true },
  { key: 'email', label: '邮箱', type: 'text', required: true },
]

export function validateTeacher(data) {
  const errors = {}
  for (const field of FIELDS) {
    if (field.required) {
      const value = data[field.key]
      if (value === undefined || value === null || String(value).trim() === '') {
        errors[field.key] = `${field.label}不能为空`
      }
    }
  }
  return { valid: Object.keys(errors).length === 0, errors }
}

export function createEmptyTeacher() {
  return FIELDS.reduce((acc, f) => {
    acc[f.key] = ''
    return acc
  }, {})
}
