import React from 'react'
import { FIELDS } from '../lib/fields'

export default function TeacherForm({
  formData,
  errors,
  editing,
  onFieldChange,
  onSave,
  onCancel,
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editing ? '编辑教师' : '新增教师'}</h2>
        <form
          className="teacher-form"
          onSubmit={(e) => {
            e.preventDefault()
            onSave()
          }}
        >
          {FIELDS.map((field) => (
            <div className="form-field" key={field.key}>
              <label htmlFor={`field-${field.key}`}>{field.label}</label>
              <input
                id={`field-${field.key}`}
                type={field.type}
                value={formData[field.key]}
                onChange={(e) => onFieldChange(field.key, e.target.value)}
                className={errors[field.key] ? 'input-error' : ''}
              />
              {errors[field.key] && (
                <span className="error-text">{errors[field.key]}</span>
              )}
            </div>
          ))}
          <div className="form-actions">
            <button type="button" className="btn" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="btn btn-primary">
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
