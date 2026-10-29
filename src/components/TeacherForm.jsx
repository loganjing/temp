import React from 'react'

const FIELDS = [
  { key: 'name', label: '教师名称', type: 'text', placeholder: '请输入教师名称' },
  { key: 'course', label: '教授课程', type: 'text', placeholder: '请输入教授课程' },
  { key: 'grade', label: '年级', type: 'text', placeholder: '请输入年级' },
  { key: 'phone', label: '手机', type: 'tel', placeholder: '请输入手机号码' },
  { key: 'email', label: '邮箱', type: 'email', placeholder: '请输入电子邮箱' },
]

export default function TeacherForm({
  data,
  errors,
  error,
  isEdit,
  onChange,
  onSubmit,
  onCancel,
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{isEdit ? '编辑教师' : '新增教师'}</h2>
        {error && <div className="form-error">{error}</div>}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
        >
          {FIELDS.map((f) => (
            <div className="form-field" key={f.key}>
              <label htmlFor={`field-${f.key}`}>{f.label}</label>
              <input
                id={`field-${f.key}`}
                type={f.type}
                value={data[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
              {errors[f.key] && (
                <span className="field-error">{errors[f.key]}</span>
              )}
            </div>
          ))}
          <div className="form-actions">
            <button type="button" className="btn btn-default" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="btn btn-primary">
              {isEdit ? '保存' : '新增'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
