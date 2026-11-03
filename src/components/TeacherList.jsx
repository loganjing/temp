/**
 * 教师列表组件
 * 以表格展示全部已录入教师记录，每行含操作按钮
 * @param {{ teachers: Array, onEdit: (teacher) => void, onDelete: (id) => void }} props
 */
export default function TeacherList({ teachers, onEdit, onDelete }) {
  if (teachers.length === 0) {
    return (
      <div className="teacher-list">
        <h2>教师列表</h2>
        <p className="empty-state">暂无教师记录，请点击「新增教师」添加</p>
      </div>
    )
  }

  return (
    <div className="teacher-list">
      <h2>教师列表（共 {teachers.length} 人）</h2>
      <table className="teacher-table">
        <colgroup>
          <col className="col-name" />
          <col className="col-grade" />
          <col className="col-course" />
          <col className="col-phone" />
          <col className="col-email" />
          <col className="col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>教师名称</th>
            <th>年级</th>
            <th>教授课程</th>
            <th>手机</th>
            <th>邮箱</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {teachers.map((teacher) => (
            <tr key={teacher.id}>
              <td>{teacher.name}</td>
              <td className="cell-center">{teacher.grade || '—'}</td>
              <td>{teacher.course || '—'}</td>
              <td>{teacher.phone || '—'}</td>
              <td>{teacher.email || '—'}</td>
              <td className="row-actions cell-center">
                <button
                  className="btn btn-edit"
                  onClick={() => onEdit(teacher)}
                >
                  编辑
                </button>
                <button
                  className="btn btn-delete"
                  onClick={() => {
                    if (window.confirm(`确定删除教师「${teacher.name}」吗？`)) {
                      onDelete(teacher.id)
                    }
                  }}
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
