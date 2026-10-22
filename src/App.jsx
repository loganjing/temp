import { useState, useEffect, useCallback } from 'react'
import { loadTeachers, addTeacher, updateTeacher, deleteTeacher } from './lib/storage.js'
import TeacherForm from './components/TeacherForm.jsx'
import TeacherTable from './components/TeacherTable.jsx'

const EMPTY_FORM = { name: '', course: '', grade: '', phone: '', email: '' }

export default function App() {
  const [teachers, setTeachers] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const refresh = useCallback(() => {
    setTeachers(loadTeachers())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleAddClick = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(true)
  }

  const handleEditClick = (teacher) => {
    setForm({
      name: teacher.name,
      course: teacher.course,
      grade: teacher.grade,
      phone: teacher.phone,
      email: teacher.email
    })
    setEditingId(teacher.id)
    setShowForm(true)
  }

  const handleFormChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleFormSubmit = () => {
    if (editingId) {
      updateTeacher(editingId, { ...form })
    } else {
      addTeacher({ ...form })
    }
    setShowForm(false)
    setForm(EMPTY_FORM)
    setEditingId(null)
    refresh()
  }

  const handleFormCancel = () => {
    setShowForm(false)
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  const handleDeleteClick = (teacher) => {
    setDeleteTarget(teacher)
  }

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      deleteTeacher(deleteTarget.id)
      setDeleteTarget(null)
      refresh()
    }
  }

  const handleDeleteCancel = () => {
    setDeleteTarget(null)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>教师管理系统</h1>
        <button className="btn btn-primary" onClick={handleAddClick}>新增教师</button>
      </header>

      <main className="app-main">
        <TeacherTable
          teachers={teachers}
          onEdit={handleEditClick}
          onDelete={handleDeleteClick}
        />
      </main>

      {showForm && (
        <TeacherForm
          form={form}
          editingId={editingId}
          onChange={handleFormChange}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
        />
      )}

      {deleteTarget && (
        <div className="modal-overlay" onClick={handleDeleteCancel}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <p>确认删除教师「{deleteTarget.name}」吗？</p>
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={handleDeleteConfirm}>确认删除</button>
              <button className="btn btn-secondary" onClick={handleDeleteCancel}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
