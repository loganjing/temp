import { useState, useEffect, useCallback } from 'react'
import TeacherList from './components/TeacherList.jsx'
import TeacherForm from './components/TeacherForm.jsx'
import TeacherDetail from './components/TeacherDetail.jsx'
import { loadTeachers, saveTeachers, generateId } from './lib/storage.js'

const STORAGE_KEY = 'teacher-mgmt:teachers'

export default function App() {
  const [teachers, setTeachers] = useState([])
  const [view, setView] = useState({ mode: 'list' }) // { mode: 'list' | 'add' | 'edit' | 'detail', teacher?: Teacher }

  useEffect(() => {
    setTeachers(loadTeachers(STORAGE_KEY))
  }, [])

  const persistTeachers = useCallback((updated) => {
    setTeachers(updated)
    saveTeachers(STORAGE_KEY, updated)
  }, [])

  const handleAdd = (data) => {
    const newTeacher = { id: generateId(), ...data }
    persistTeachers([...teachers, newTeacher])
    setView({ mode: 'list' })
  }

  const handleUpdate = (id, data) => {
    const updated = teachers.map((t) => (t.id === id ? { ...t, ...data } : t))
    persistTeachers(updated)
    setView({ mode: 'list' })
  }

  const handleDelete = (id) => {
    const updated = teachers.filter((t) => t.id !== id)
    persistTeachers(updated)
    setView({ mode: 'list' })
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>教师管理系统</h1>
      </header>
      <main className="app-main">
        {view.mode === 'list' && (
          <TeacherList
            teachers={teachers}
            onAdd={() => setView({ mode: 'add' })}
            onEdit={(teacher) => setView({ mode: 'edit', teacher })}
            onDetail={(teacher) => setView({ mode: 'detail', teacher })}
            onDelete={handleDelete}
          />
        )}
        {view.mode === 'add' && (
          <TeacherForm
            mode="add"
            onSubmit={handleAdd}
            onCancel={() => setView({ mode: 'list' })}
          />
        )}
        {view.mode === 'edit' && (
          <TeacherForm
            mode="edit"
            teacher={view.teacher}
            onSubmit={(data) => handleUpdate(view.teacher.id, data)}
            onCancel={() => setView({ mode: 'list' })}
          />
        )}
        {view.mode === 'detail' && (
          <TeacherDetail
            teacher={view.teacher}
            onBack={() => setView({ mode: 'list' })}
          />
        )}
      </main>
    </div>
  )
}
