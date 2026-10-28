import React from 'react'

/**
 * 教师列表组件
 * 以表格形式展示教师记录，每行提供编辑和删除操作
 */
export default function TeacherList({ teachers, onEdit, onDelete }) {
  if (teachers.length === 0) {
    return (
      <div className="empty-state">
        <p>暂无教师记录，点击「新增教师」开始添加。</p>
      </div>
    )
  }

  return (
    <div className="teacher-table-wrapper">
      <table className="teacher-table">
        <thead>
          <tr>
            <th>教师名称</th>
            <th>教授课程</th>
            <th>年级</th>
            <th>手机</th>
            <th>邮箱</th>
            <th className="col-actions">操作</th>
          </tr>
        </thead>
        <tbody>
          {teachers.map((teacher) => (
            <tr key={teacher.id}>
              <td>{teacher.name}</td>
              <td>{teacher.course || '-'}</td>
              <td>{teacher.grade || '-'}</td>
              <td>{teacher.phone || '-'}</td>
              <td>{teacher.email || '-'}</td>
              <td className="col-actions">
                <button
                  className="btn btn-sm btn-default"
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
    </div>
  )
}
