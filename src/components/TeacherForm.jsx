const FIELDS = [
  { key: 'name', label: '教师名称', type: 'text', placeholder: '请输入教师名称' },
  { key: 'course', label: '教授课程', type: 'text', placeholder: '请输入教授课程' },
  { key: 'grade', label: '年级', type: 'text', placeholder: '请输入年级' },
  { key: 'phone', label: '手机', type: 'text', placeholder: '请输入手机号码' },
  { key: 'email', label: '邮箱', type: 'text', placeholder: '请输入电子邮箱' }
]

export default function TeacherForm({ form, editingId, onChange, onSubmit, onCancel }) {
  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit()
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-form" onClick={e => e.stopPropagation()}>
        <h2>{editingId ? '编辑教师' : '新增教师'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-fields">
            {FIELDS.map(f => (
              <div className="form-field" key={f.key}>
                <label htmlFor={`field-${f.key}`}>{f.label}</label>
                <input
                  id={`field-${f.key}`}
                  type={f.type}
                  value={form[f.key] || ''}
                  placeholder={f.placeholder}
                  onChange={e => onChange(f.key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <button type="submit" className="btn btn-primary">
              {editingId ? '保存修改' : '保存'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  )
}
