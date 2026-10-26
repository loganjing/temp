import React, { useState, useEffect } from 'react'
import TeacherList from './components/TeacherList'
import TeacherForm from './components/TeacherForm'
import { loadTeachers, createTeacher, updateTeacher, deleteTeacher } from './lib/storage'
import { createEmptyTeacher, validateTeacher, FIELDS } from './lib/fields'

export default function App() {
  const [teachers, setTeachers] = useState([])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formData, setFormData] = useState(createEmptyTeacher())
  const [errors, setErrors] = useState({})

  useEffect(() => {
    setTeachers(loadTeachers())
  }, [])

  const refresh = () => setTeachers(loadTeachers())

  const handleAdd = () => {
    setEditing(null)
    setFormData(createEmptyTeacher())
    setErrors({})
    setFormOpen(true)
  }

  const handleEdit = (teacher) => {
    setEditing(teacher)
    setFormData(FIELDS.reduce((acc, f) => {
      acc[f.key] = teacher[f.key] || ''
      return acc
    }, {}))
    setErrors({})
    setFormOpen(true)
  }

  const handleDelete = (teacher) => {
    deleteTeacher(teacher.id)
    refresh()
  }

  const handleFieldChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const handleSave = () => {
    const { valid, errors: validationErrors } = validateTeacher(formData)
    if (!valid) {
      setErrors(validationErrors)
      return
    }
    if (editing) {
      updateTeacher(editing.id, formData)
    } else {
      createTeacher(formData)
    }
    setFormOpen(false)
    refresh()
  }

  const handleCancel = () => {
    setFormOpen(false)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>教师管理系统</h1>
        <button className="btn btn-primary" onClick={handleAdd}>
          新增教师
        </button>
      </header>
      <main className="app-main">
        <TeacherList
          teachers={teachers}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </main>
      {formOpen && (
        <TeacherForm
          formData={formData}
          errors={errors}
          editing={editing}
          onFieldChange={handleFieldChange}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </div>
  )
}
