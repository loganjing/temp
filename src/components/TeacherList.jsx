import React from 'react'

const FIELD_LABELS = [
  { key: 'name', label: '教师名称' },
  { key: 'course', label: '教授课程' },
  { key: 'grade', label: '年级' },
  { key: 'phone', label: '手机' },
  { key: 'email', label: '邮箱' },
]

export default function TeacherList({ teachers, onEdit, onDelete }) {
  if (teachers.length === 0) {
    return (
      <div className="empty-state">
        <p>暂无教师记录，点击「新增教师」添加第一条记录。</p>
      </div>
    )
  }

  return (
    <div className="table-wrapper">
      <table className="teacher-table">
        <thead>
          <tr>
            {FIELD_LABELS.map((f) => (
              <th key={f.key}>{f.label}</th>
            ))}
            <th className="col-actions">操作</th>
          </tr>
        </thead>
        <tbody>
          {teachers.map((teacher) => (
            <tr key={teacher.id}>
              {FIELD_LABELS.map((f) => (
                <td key={f.key}>{teacher[f.key]}</td>
              ))}
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
