import React, { useState, useEffect } from 'react'
import TeacherList from './components/TeacherList.jsx'
import TeacherForm from './components/TeacherForm.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'
import { loadTeachers, saveTeachers } from './lib/storage.js'
import { validateTeacher } from './lib/validation.js'

const EMPTY_FORM = {
  name: '',
  course: '',
  grade: '',
  phone: '',
  email: '',
}

export default function App() {
  const [teachers, setTeachers] = useState([])
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    setTeachers(loadTeachers())
  }, [])

  function persistTeachers(updated) {
    const ok = saveTeachers(updated)
    if (!ok) {
      return false
    }
    setTeachers(updated)
    return true
  }

  function handleAddClick() {
    setEditingId(null)
    setFormData(EMPTY_FORM)
    setFormErrors({})
    setFormError('')
    setFormOpen(true)
  }

  function handleEditClick(teacher) {
    setEditingId(teacher.id)
    setFormData({
      name: teacher.name,
      course: teacher.course,
      grade: teacher.grade,
      phone: teacher.phone,
      email: teacher.email,
    })
    setFormErrors({})
    setFormError('')
    setFormOpen(true)
  }

  function handleFormChange(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setFormErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function handleFormSubmit() {
    const errors = validateTeacher(formData)
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }
    setFormErrors({})

    const trimmed = {
      name: formData.name.trim(),
      course: formData.course.trim(),
      grade: formData.grade.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim(),
    }

    if (editingId) {
      const updated = teachers.map((t) =>
        t.id === editingId ? { ...t, ...trimmed } : t,
      )
      if (persistTeachers(updated)) {
        setFormOpen(false)
      } else {
        setFormError('数据保存失败，请检查浏览器存储空间')
      }
    } else {
      const newTeacher = {
        id: crypto.randomUUID(),
        ...trimmed,
      }
      const updated = [...teachers, newTeacher]
      if (persistTeachers(updated)) {
        setFormOpen(false)
      } else {
        setFormError('数据保存失败，请检查浏览器存储空间')
      }
    }
  }

  function handleFormCancel() {
    setFormOpen(false)
  }

  function handleDeleteClick(teacher) {
    setDeleteError('')
    setDeleteTarget(teacher)
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return
    const updated = teachers.filter((t) => t.id !== deleteTarget.id)
    if (persistTeachers(updated)) {
      setDeleteError('')
      setDeleteTarget(null)
    } else {
      setDeleteError('删除失败，请检查浏览器存储空间后重试')
    }
  }

  function handleDeleteCancel() {
    setDeleteError('')
    setDeleteTarget(null)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>教师管理系统</h1>
      </header>
      <main className="app-main">
        <div className="toolbar">
          <button className="btn btn-primary" onClick={handleAddClick}>
            新增教师
          </button>
        </div>
        <TeacherList
          teachers={teachers}
          onEdit={handleEditClick}
          onDelete={handleDeleteClick}
        />
      </main>
      {formOpen && (
        <TeacherForm
          data={formData}
          errors={formErrors}
          error={formError}
          isEdit={!!editingId}
          onChange={handleFormChange}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="确认删除"
          message={`确定要删除教师「${deleteTarget.name}」吗？此操作不可撤销。`}
          error={deleteError}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />
      )}
    </div>
  )
}
