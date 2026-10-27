import { useState, useEffect, useCallback } from 'react'
import type { Teacher, TeacherFormData } from './types'
import { loadTeachers, addTeacher, updateTeacher, deleteTeacher } from './storage'
import { TeacherList } from './components/TeacherList'
import { TeacherForm } from './components/TeacherForm'

type View = 'list' | 'add' | 'edit'

export function App() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [view, setView] = useState<View>('list')
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null)

  useEffect(() => {
    setTeachers(loadTeachers())
  }, [])

  const refreshList = useCallback(() => {
    setTeachers(loadTeachers())
  }, [])

  const handleAdd = useCallback((data: TeacherFormData) => {
    addTeacher(data)
    refreshList()
    setView('list')
  }, [refreshList])

  const handleUpdate = useCallback((data: TeacherFormData) => {
    if (editingTeacher) {
      updateTeacher(editingTeacher.id, data)
      setEditingTeacher(null)
      refreshList()
      setView('list')
    }
  }, [editingTeacher, refreshList])

  const handleEdit = useCallback((teacher: Teacher) => {
    setEditingTeacher(teacher)
    setView('edit')
  }, [])

  const handleDelete = useCallback((teacher: Teacher) => {
    deleteTeacher(teacher.id)
    refreshList()
  }, [refreshList])

  const handleCancel = useCallback(() => {
    setEditingTeacher(null)
    setView('list')
  }, [])

  const handleAddClick = useCallback(() => {
    setEditingTeacher(null)
    setView('add')
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>教师管理系统</h1>
      </header>

      <main className="app-main">
        {view === 'list' && (
          <div className="list-view">
            <div className="list-toolbar">
              <button className="btn btn-primary" onClick={handleAddClick}>新增教师</button>
            </div>
            <TeacherList
              teachers={teachers}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          </div>
        )}

        {(view === 'add' || view === 'edit') && (
          <TeacherForm
            initialData={view === 'edit' ? editingTeacher : null}
            onSubmit={view === 'add' ? handleAdd : handleUpdate}
            onCancel={handleCancel}
          />
        )}
      </main>
    </div>
  )
}
