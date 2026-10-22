const COLUMNS = [
  { key: 'name', label: '教师名称' },
  { key: 'course', label: '教授课程' },
  { key: 'grade', label: '年级' },
  { key: 'phone', label: '手机' },
  { key: 'email', label: '邮箱' }
]

export default function TeacherTable({ teachers, onEdit, onDelete }) {
  if (teachers.length === 0) {
    return (
      <div className="empty-state">
        <p>暂无教师记录，点击「新增教师」添加。</p>
      </div>
    )
  }

  return (
    <table className="teacher-table">
      <thead>
        <tr>
          {COLUMNS.map(col => (
            <th key={col.key}>{col.label}</th>
          ))}
          <th className="col-actions">操作</th>
        </tr>
      </thead>
      <tbody>
        {teachers.map(teacher => (
          <tr key={teacher.id}>
            {COLUMNS.map(col => (
              <td key={col.key}>{teacher[col.key] ?? ''}</td>
            ))}
            <td className="col-actions">
              <button className="btn btn-sm btn-link" onClick={() => onEdit(teacher)}>编辑</button>
              <button className="btn btn-sm btn-link btn-danger-link" onClick={() => onDelete(teacher)}>删除</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
