import { useState } from 'react'
import TeacherList from './components/TeacherList.jsx'
import TeacherForm from './components/TeacherForm.jsx'
import { useTeachers } from './hooks/useTeachers.js'

export default function App() {
  const { teachers, addTeacher, updateTeacher, deleteTeacher } = useTeachers()
  const [showForm, setShowForm] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState(null)

  const handleAddClick = () => {
    setEditingTeacher(null)
    setShowForm(true)
  }

  const handleEditClick = (teacher) => {
    setEditingTeacher(teacher)
    setShowForm(true)
  }

  const handleSubmit = (data) => {
    if (editingTeacher) {
      updateTeacher(editingTeacher.id, data)
    } else {
      addTeacher(data)
    }
    setShowForm(false)
    setEditingTeacher(null)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingTeacher(null)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>教师管理系统</h1>
      </header>

      <main className="app-main">
        {!showForm && (
          <div className="toolbar">
            <button className="btn btn-primary" onClick={handleAddClick}>
              新增教师
            </button>
          </div>
        )}

        {showForm ? (
          <TeacherForm
            editingTeacher={editingTeacher}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        ) : (
          <TeacherList
            teachers={teachers}
            onEdit={handleEditClick}
            onDelete={deleteTeacher}
          />
        )}
      </main>
    </div>
  )
}
