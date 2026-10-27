import type { Teacher } from '../types'

interface TeacherListProps {
  teachers: Teacher[]
  onEdit: (teacher: Teacher) => void
  onDelete: (teacher: Teacher) => void
}

export function TeacherList({ teachers, onEdit, onDelete }: TeacherListProps) {
  if (teachers.length === 0) {
    return <div className="empty-state">暂无教师记录，请点击「新增教师」添加。</div>
  }

  return (
    <table className="teacher-table">
      <thead>
        <tr>
          <th>教师名称</th>
          <th>教授课程</th>
          <th>年级</th>
          <th>手机</th>
          <th>邮箱</th>
          <th className="actions-col">操作</th>
        </tr>
      </thead>
      <tbody>
        {teachers.map((teacher) => (
          <tr key={teacher.id}>
            <td>{teacher.name}</td>
            <td>{teacher.course}</td>
            <td>{teacher.grade}</td>
            <td>{teacher.phone || '—'}</td>
            <td>{teacher.email || '—'}</td>
            <td className="actions-cell">
              <button className="btn btn-small btn-secondary" onClick={() => onEdit(teacher)}>编辑</button>
              <button className="btn btn-small btn-danger" onClick={() => onDelete(teacher)}>删除</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
