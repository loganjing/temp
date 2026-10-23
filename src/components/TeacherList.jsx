const FIELD_LABELS = {
  name: '教师名称',
  courses: '教授课程',
  grade: '年级',
  phone: '手机',
  email: '邮箱'
}

const FIELD_ORDER = ['name', 'courses', 'grade', 'phone', 'email']

export default function TeacherList({ teachers, onEdit, onDelete }) {
  if (teachers.length === 0) {
    return (
      <div className="empty-state">
        <p>暂无教师记录，点击「新增教师」开始添加。</p>
      </div>
    )
  }

  return (
    <table className="teacher-table">
      <thead>
        <tr>
          {FIELD_ORDER.map((key) => (
            <th key={key}>{FIELD_LABELS[key]}</th>
          ))}
          <th className="col-actions">操作</th>
        </tr>
      </thead>
      <tbody>
        {teachers.map((teacher) => (
          <tr key={teacher.id}>
            {FIELD_ORDER.map((key) => (
              <td key={key}>{teacher[key]}</td>
            ))}
            <td className="col-actions">
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => onEdit(teacher)}
              >
                编辑
              </button>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => onDelete(teacher)}
              >
                删除
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
