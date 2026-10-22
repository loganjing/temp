export default function TeacherList({ teachers, onAdd, onEdit, onDetail, onDelete }) {
  return (
    <div className="teacher-list-container">
      <div className="list-header">
        <h2>教师列表</h2>
        <button className="btn btn-primary" onClick={onAdd}>
          新增教师
        </button>
      </div>

      {teachers.length === 0 ? (
        <div className="empty-state">
          <p>暂无教师记录，请点击「新增教师」添加。</p>
        </div>
      ) : (
        <table className="teacher-table">
          <thead>
            <tr>
              <th>教师名称</th>
              <th>教授课程</th>
              <th>年级</th>
              <th>手机</th>
              <th>邮箱</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((teacher) => (
              <tr key={teacher.id}>
                <td>{teacher.teacherName}</td>
                <td>{teacher.course}</td>
                <td>{teacher.grade}</td>
                <td>{teacher.phone}</td>
                <td>{teacher.email}</td>
                <td className="row-actions">
                  <button className="btn btn-link" onClick={() => onDetail(teacher)}>
                    详情
                  </button>
                  <button className="btn btn-link" onClick={() => onEdit(teacher)}>
                    编辑
                  </button>
                  <button
                    className="btn btn-link btn-danger-link"
                    onClick={() => {
                      if (window.confirm(`确定删除教师「${teacher.teacherName}」吗？`)) {
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
      )}
    </div>
  )
}
