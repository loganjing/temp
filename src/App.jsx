import { useState } from 'react'
import { useTeachers } from './hooks/useTeachers.js'
import TeacherList from './components/TeacherList.jsx'
import TeacherForm from './components/TeacherForm.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'

export default function App() {
  const { teachers, addTeacher, updateTeacher, deleteTeacher } = useTeachers()

  const [formOpen, setFormOpen] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [searchKeyword, setSearchKeyword] = useState('')

  const handleAdd = () => {
    setEditingTeacher(null)
    setFormOpen(true)
  }

  const handleEdit = (teacher) => {
    setEditingTeacher(teacher)
    setFormOpen(true)
  }

  const handleFormSubmit = (data) => {
    if (editingTeacher) {
      updateTeacher(editingTeacher.id, data)
    } else {
      addTeacher(data)
    }
    setFormOpen(false)
    setEditingTeacher(null)
  }

  const handleFormCancel = () => {
    setFormOpen(false)
    setEditingTeacher(null)
  }

  const handleDeleteRequest = (teacher) => {
    setDeleteTarget(teacher)
  }

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      deleteTeacher(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  const handleDeleteCancel = () => {
    setDeleteTarget(null)
  }

  const filteredTeachers = searchKeyword.trim()
    ? teachers.filter((t) =>
        t.name.toLowerCase().includes(searchKeyword.trim().toLowerCase())
      )
    : teachers

  return (
    <div className="app">
      <header className="app-header">
        <h1>教师管理系统</h1>
      </header>

      <main className="app-main">
        <div className="toolbar">
          <input
            type="text"
            className="search-input"
            placeholder="按教师名称搜索…"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleAdd}>
            新增教师
          </button>
        </div>

        <TeacherList
          teachers={filteredTeachers}
          onEdit={handleEdit}
          onDelete={handleDeleteRequest}
        />
      </main>

      {formOpen && (
        <TeacherForm
          initialData={editingTeacher}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="确认删除"
          message={`确定要删除教师「${deleteTarget.name}」吗？此操作不可撤销。`}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />
      )}
    </div>
  )
}
