import { useState } from 'react'
import { validateTeacher } from '../utils/validation.js'

const FIELDS = [
  { name: 'name', label: '教师名称', type: 'text', placeholder: '请输入教师姓名' },
  { name: 'courses', label: '教授课程', type: 'text', placeholder: '请输入教授课程' },
  { name: 'grade', label: '年级', type: 'text', placeholder: '请输入年级' },
  { name: 'phone', label: '手机', type: 'text', placeholder: '请输入手机号码' },
  { name: 'email', label: '邮箱', type: 'email', placeholder: '请输入邮箱地址' }
]

const EMPTY_DATA = { name: '', courses: '', grade: '', phone: '', email: '' }

export default function TeacherForm({ initialData, onSubmit, onCancel }) {
  const [data, setData] = useState(() => {
    if (!initialData) return { ...EMPTY_DATA }
    const { id, ...rest } = initialData
    return { ...EMPTY_DATA, ...rest }
  })
  const [errors, setErrors] = useState({})

  const handleChange = (field, value) => {
    setData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const validationErrors = validateTeacher(data)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }
    const trimmed = {}
    for (const key of Object.keys(EMPTY_DATA)) {
      trimmed[key] = data[key].trim()
    }
    onSubmit(trimmed)
  }

  const isEditing = !!initialData

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{isEditing ? '编辑教师' : '新增教师'}</h2>
        <form onSubmit={handleSubmit} noValidate>
          {FIELDS.map((field) => (
            <div className="form-field" key={field.name}>
              <label className="form-label" htmlFor={field.name}>
                {field.label}
                <span className="required-mark">*</span>
              </label>
              <input
                id={field.name}
                type={field.type}
                className={`form-input ${errors[field.name] ? 'has-error' : ''}`}
                value={data[field.name]}
                placeholder={field.placeholder}
                onChange={(e) => handleChange(field.name, e.target.value)}
              />
              {errors[field.name] && (
                <span className="field-error">{errors[field.name]}</span>
              )}
            </div>
          ))}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="btn btn-primary">
              {isEditing ? '保存修改' : '确认新增'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
