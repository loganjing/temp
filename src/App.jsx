import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'teachers_data'
const FIELDS = [
  { key: 'name', label: '教师名称', required: true, maxLength: 50 },
  { key: 'course', label: '教授课程', required: true, maxLength: 50 },
  { key: 'grade', label: '年级', required: true, maxLength: 50 },
  { key: 'phone', label: '手机', required: true, maxLength: 20 },
  { key: 'email', label: '邮箱', required: false, maxLength: 100 }
]

function loadTeachers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function saveTeachers(teachers) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teachers))
}

function validateField(field, value) {
  const v = (value || '').trim()
  if (field.required && !v) {
    return `${field.label}不能为空`
  }
  if (field.key === 'phone' && v) {
    if (!/^1\d{10}$/.test(v)) {
      return '请输入正确的手机号码'
    }
  }
  if (field.key === 'email' && v) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      return '请输入正确的邮箱地址'
    }
  }
  if (field.maxLength && v.length > field.maxLength) {
    return `${field.label}不能超过 ${field.maxLength} 字符`
  }
  return null
}

function validateAll(formData) {
  const errors = {}
  for (const field of FIELDS) {
    const err = validateField(field, formData[field.key])
    if (err) errors[field.key] = err
  }
  return errors
}

const emptyForm = () => FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: '' }), {})

function TeacherForm({ initialData, onSave, onCancel }) {
  const [formData, setFormData] = useState(initialData || emptyForm())
  const [errors, setErrors] = useState({})

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }))
    if (errors[key]) {
      setErrors(prev => { const next = { ...prev }; delete next[key]; return next })
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const validationErrors = validateAll(formData)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }
    const cleaned = FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: formData[f.key].trim() }), {})
    onSave(cleaned)
  }

  return (
    <form className="teacher-form" onSubmit={handleSubmit} noValidate>
      <div className="form-fields">
        {FIELDS.map(field => (
          <div className="form-field" key={field.key}>
            <label htmlFor={`field-${field.key}`}>
              {field.label}
              {field.required && <span className="required-mark">*</span>}
            </label>
            <input
              id={`field-${field.key}`}
              type="text"
              value={formData[field.key]}
              onChange={e => handleChange(field.key, e.target.value)}
              maxLength={field.maxLength}
              placeholder={`请输入${field.label}`}
              className={errors[field.key] ? 'input-error' : ''}
            />
            {errors[field.key] && <span className="error-text">{errors[field.key]}</span>}
          </div>
        ))}
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>取消</button>
        <button type="submit" className="btn btn-primary">保存</button>
      </div>
    </form>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <p className="confirm-message">{message}</p>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>取消</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>确认</button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [teachers, setTeachers] = useState([])
  const [modalState, setModalState] = useState({ type: null, data: null })
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    setTeachers(loadTeachers())
  }, [])

  const refreshTeachers = useCallback(() => {
    setTeachers(loadTeachers())
  }, [])

  const handleAdd = () => {
    setModalState({ type: 'add', data: emptyForm() })
  }

  const handleEdit = (teacher) => {
    const formData = FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: teacher[f.key] || '' }), {})
    setModalState({ type: 'edit', data: formData, id: teacher.id })
  }

  const handleSave = (cleanedData) => {
    const current = loadTeachers()
    if (modalState.type === 'add') {
      const newTeacher = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        ...cleanedData,
        createdAt: Date.now()
      }
      saveTeachers([newTeacher, ...current])
    } else if (modalState.type === 'edit') {
      const updated = current.map(t =>
        t.id === modalState.id ? { ...t, ...cleanedData } : t
      )
      saveTeachers(updated)
    }
    setModalState({ type: null, data: null })
    refreshTeachers()
  }

  const handleDeleteRequest = (teacher) => {
    setDeleteTarget(teacher)
  }

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      const current = loadTeachers()
      saveTeachers(current.filter(t => t.id !== deleteTarget.id))
      setDeleteTarget(null)
      refreshTeachers()
    }
  }

  const handleDeleteCancel = () => {
    setDeleteTarget(null)
  }

  const closeModal = () => {
    setModalState({ type: null, data: null })
  }

  const sortedTeachers = [...teachers].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

  return (
    <div className="app">
      <header className="app-header">
        <h1>教师管理系统</h1>
      </header>
      <main className="app-main">
        <div className="toolbar">
          <button className="btn btn-primary" onClick={handleAdd}>新增教师</button>
        </div>
        {sortedTeachers.length === 0 ? (
          <div className="empty-state">
            <p>暂无教师数据，请点击「新增教师」添加</p>
          </div>
        ) : (
          <table className="teacher-table">
            <thead>
              <tr>
                {FIELDS.map(f => <th key={f.key}>{f.label}</th>)}
                <th className="action-column">操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedTeachers.map(teacher => (
                <tr key={teacher.id}>
                  {FIELDS.map(f => <td key={f.key}>{teacher[f.key] || '—'}</td>)}
                  <td className="action-cell">
                    <button className="btn btn-sm btn-link" onClick={() => handleEdit(teacher)}>编辑</button>
                    <button className="btn btn-sm btn-link btn-danger-link" onClick={() => handleDeleteRequest(teacher)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>

      {modalState.type && (
        <Modal
          title={modalState.type === 'add' ? '新增教师' : '编辑教师'}
          onClose={closeModal}
        >
          <TeacherForm
            initialData={modalState.data}
            onSave={handleSave}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`确定删除教师「${deleteTarget.name}」吗？`}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />
      )}
    </div>
  )
}
