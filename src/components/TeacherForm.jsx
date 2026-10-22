import { useState } from 'react'
import { validateTeacher } from '../lib/validation.js'

const emptyForm = {
  teacherName: '',
  course: '',
  grade: '',
  phone: '',
  email: '',
}

export default function TeacherForm({ mode, teacher, onSubmit, onCancel }) {
  const [formData, setFormData] = useState(
    mode === 'edit' && teacher
      ? { teacherName: teacher.teacherName || '', course: teacher.course || '', grade: teacher.grade || '', phone: teacher.phone || '', email: teacher.email || '' }
      : { ...emptyForm }
  )
  const [errors, setErrors] = useState({})

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const result = validateTeacher(formData)
    if (!result.valid) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    onSubmit(formData)
  }

  return (
    <div className="teacher-form-container">
      <h2>{mode === 'edit' ? '编辑教师' : '新增教师'}</h2>
      <form onSubmit={handleSubmit} className="teacher-form">
        <div className="form-field">
          <label htmlFor="teacherName">教师名称 *</label>
          <input
            id="teacherName"
            name="teacherName"
            type="text"
            value={formData.teacherName}
            onChange={handleChange}
            placeholder="请输入教师名称"
          />
          {errors.teacherName && <span className="field-error">{errors.teacherName}</span>}
        </div>

        <div className="form-field">
          <label htmlFor="course">教授课程</label>
          <input
            id="course"
            name="course"
            type="text"
            value={formData.course}
            onChange={handleChange}
            placeholder="请输入教授课程"
          />
        </div>

        <div className="form-field">
          <label htmlFor="grade">年级</label>
          <input
            id="grade"
            name="grade"
            type="text"
            value={formData.grade}
            onChange={handleChange}
            placeholder="请输入年级"
          />
        </div>

        <div className="form-field">
          <label htmlFor="phone">手机 *</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={handleChange}
            placeholder="请输入手机号"
          />
          {errors.phone && <span className="field-error">{errors.phone}</span>}
        </div>

        <div className="form-field">
          <label htmlFor="email">邮箱 *</label>
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="请输入邮箱"
          />
          {errors.email && <span className="field-error">{errors.email}</span>}
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            {mode === 'edit' ? '保存修改' : '创建教师'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            取消
          </button>
        </div>
      </form>
    </div>
  )
}
