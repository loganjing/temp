import React, { useState, useEffect, useCallback } from 'react'
import TeacherList from './components/TeacherList.jsx'
import TeacherForm from './components/TeacherForm.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'
import * as storage from './lib/storage.js'

export default function App() {
  const [teachers, setTeachers] = useState([])
  const [formOpen, setFormOpen] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  // 加载教师列表
  const refreshTeachers = useCallback(() => {
    setTeachers(storage.getTeachers())
  }, [])

  useEffect(() => {
    refreshTeachers()
  }, [refreshTeachers])

  // 新增
  const handleAdd = () => {
    setEditingTeacher(null)
    setFormOpen(true)
  }

  // 编辑
  const handleEdit = (teacher) => {
    setEditingTeacher(teacher)
    setFormOpen(true)
  }

  // 表单提交（新增或编辑）
  const handleSubmit = (data) => {
    if (editingTeacher) {
      storage.updateTeacher(editingTeacher.id, data)
    } else {
      storage.saveTeacher(data)
    }
    setFormOpen(false)
    setEditingTeacher(null)
    refreshTeachers()
  }

  // 删除确认
  const handleDeleteRequest = (teacher) => {
    setDeleteTarget(teacher)
  }

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      storage.deleteTeacher(deleteTarget.id)
      setDeleteTarget(null)
      refreshTeachers()
    }
  }

  const handleDeleteCancel = () => {
    setDeleteTarget(null)
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
          onDelete={handleDeleteRequest}
        />
      </main>

      {formOpen && (
        <TeacherForm
          teacher={editingTeacher}
          onSubmit={handleSubmit}
          onCancel={() => {
            setFormOpen(false)
            setEditingTeacher(null)
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="确认删除"
          message={`确定要删除教师「${deleteTarget.name}」吗？删除后无法恢复。`}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />
      )}
    </div>
  )
}
