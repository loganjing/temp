import React, { useState } from 'react'
import { validateTeacher } from '../lib/validation.js'

/**
 * 新增/编辑教师表单组件
 * 新增模式：空表单提交后创建记录
 * 编辑模式：预填已有数据，提交后更新记录
 */
export default function TeacherForm({ teacher, onSubmit, onCancel }) {
  const isEditing = !!teacher

  const [formData, setFormData] = useState({
    name: teacher?.name || '',
    course: teacher?.course || '',
    grade: teacher?.grade || '',
    phone: teacher?.phone || '',
    email: teacher?.email || ''
  })

  const [errors, setErrors] = useState({})

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    // 清除该字段的错误提示
    if (errors[name]) {
      setErrors(prev => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const result = validateTeacher(formData)
    if (!result.valid) {
      setErrors(result.errors)
      return
    }
    onSubmit({
      name: formData.name.trim(),
      course: formData.course.trim(),
      grade: formData.grade.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim()
    })
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{isEditing ? '编辑教师' : '新增教师'}</h2>
        <form onSubmit={handleSubmit} className="teacher-form">
          <div className="form-field">
            <label htmlFor="name">
              教师名称 <span className="required">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="请输入教师名称"
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>

          <div className="form-field">
            <label htmlFor="course">教授课程</label>
            <input
              type="text"
              id="course"
              name="course"
              value={formData.course}
              onChange={handleChange}
              placeholder="请输入教授课程"
            />
          </div>

          <div className="form-field">
            <label htmlFor="grade">年级</label>
            <input
              type="text"
              id="grade"
              name="grade"
              value={formData.grade}
              onChange={handleChange}
              placeholder="请输入年级"
            />
          </div>

          <div className="form-field">
            <label htmlFor="phone">手机</label>
            <input
              type="text"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="请输入手机号码"
            />
            {errors.phone && <span className="field-error">{errors.phone}</span>}
          </div>

          <div className="form-field">
            <label htmlFor="email">邮箱</label>
            <input
              type="text"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="请输入邮箱地址"
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-default" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="btn btn-primary">
              {isEditing ? '保存修改' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
