import { useState } from 'react'
import type { TeacherFormData, Teacher } from '../types'
import { validateTeacher, type ValidationErrors } from '../validation'

interface TeacherFormProps {
  initialData?: Teacher | null
  onSubmit: (data: TeacherFormData) => void
  onCancel: () => void
}

const emptyForm: TeacherFormData = {
  name: '',
  course: '',
  grade: '',
  phone: '',
  email: '',
}

export function TeacherForm({ initialData, onSubmit, onCancel }: TeacherFormProps) {
  const [formData, setFormData] = useState<TeacherFormData>(
    initialData
      ? { name: initialData.name, course: initialData.course, grade: initialData.grade, phone: initialData.phone, email: initialData.email }
      : emptyForm
  )
  const [errors, setErrors] = useState<ValidationErrors>({})

  const handleChange = (field: keyof TeacherFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const validationErrors = validateTeacher(formData)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }
    setErrors({})
    onSubmit(formData)
  }

  const isEdit = !!initialData

  return (
    <form className="teacher-form" onSubmit={handleSubmit}>
      <h2>{isEdit ? '编辑教师' : '新增教师'}</h2>

      <div className="form-field">
        <label htmlFor="name">教师名称 *</label>
        <input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="请输入教师名称"
        />
        {errors.name && <span className="field-error">{errors.name}</span>}
      </div>

      <div className="form-field">
        <label htmlFor="course">教授课程 *</label>
        <input
          id="course"
          type="text"
          value={formData.course}
          onChange={(e) => handleChange('course', e.target.value)}
          placeholder="请输入教授课程"
        />
        {errors.course && <span className="field-error">{errors.course}</span>}
      </div>

      <div className="form-field">
        <label htmlFor="grade">年级 *</label>
        <input
          id="grade"
          type="text"
          value={formData.grade}
          onChange={(e) => handleChange('grade', e.target.value)}
          placeholder="请输入年级"
        />
        {errors.grade && <span className="field-error">{errors.grade}</span>}
      </div>

      <div className="form-field">
        <label htmlFor="phone">手机</label>
        <input
          id="phone"
          type="text"
          value={formData.phone}
          onChange={(e) => handleChange('phone', e.target.value)}
          placeholder="请输入手机号（选填）"
        />
        {errors.phone && <span className="field-error">{errors.phone}</span>}
      </div>

      <div className="form-field">
        <label htmlFor="email">邮箱</label>
        <input
          id="email"
          type="text"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder="请输入邮箱地址（选填）"
        />
        {errors.email && <span className="field-error">{errors.email}</span>}
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">{isEdit ? '保存修改' : '添加教师'}</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>取消</button>
      </div>
    </form>
  )
}
