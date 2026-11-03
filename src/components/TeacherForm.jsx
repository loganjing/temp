import { useState, useEffect } from 'react'
import { validateTeacher } from '../utils/validation.js'

const EMPTY_FORM = {
  name: '',
  course: '',
  grade: '',
  phone: '',
  email: '',
}

/**
 * 教师表单组件
 * 用于新增和编辑教师信息
 * @param {{ editingTeacher: object | null, onSubmit: (data) => void, onCancel: () => void }} props
 */
export default function TeacherForm({ editingTeacher, onSubmit, onCancel }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (editingTeacher) {
      setForm({
        name: editingTeacher.name || '',
        course: editingTeacher.course || '',
        grade: editingTeacher.grade || '',
        phone: editingTeacher.phone || '',
        email: editingTeacher.email || '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setErrors({})
  }, [editingTeacher])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const { valid, errors: validationErrors } = validateTeacher(form)
    if (!valid) {
      setErrors(validationErrors)
      return
    }
    onSubmit(form)
  }

  const isEditing = !!editingTeacher

  return (
    <form className="teacher-form" onSubmit={handleSubmit} noValidate>
      <h2>{isEditing ? '编辑教师' : '新增教师'}</h2>

      <div className="form-field">
        <label htmlFor="name">
          教师名称 <span className="required">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          value={form.name}
          onChange={handleChange}
          placeholder="请输入教师名称"
        />
        {errors.name && <span className="field-error">{errors.name}</span>}
      </div>

      <div className="form-field">
        <label htmlFor="course">教授课程</label>
        <input
          id="course"
          name="course"
          type="text"
          value={form.course}
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
          value={form.grade}
          onChange={handleChange}
          placeholder="请输入年级"
        />
      </div>

      <div className="form-field">
        <label htmlFor="phone">手机</label>
        <input
          id="phone"
          name="phone"
          type="text"
          value={form.phone}
          onChange={handleChange}
          placeholder="请输入手机号"
        />
        {errors.phone && <span className="field-error">{errors.phone}</span>}
      </div>

      <div className="form-field">
        <label htmlFor="email">邮箱</label>
        <input
          id="email"
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          placeholder="请输入邮箱"
        />
        {errors.email && <span className="field-error">{errors.email}</span>}
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          {isEditing ? '保存修改' : '添加教师'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  )
}
