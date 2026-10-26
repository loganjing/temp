import React from 'react'
import { FIELDS } from '../lib/fields'

export default function TeacherList({ teachers, onEdit, onDelete }) {
  if (teachers.length === 0) {
    return (
      <div className="empty-state">
        <p>暂无教师记录，请点击「新增教师」添加。</p>
      </div>
    )
  }

  return (
    <table className="teacher-table">
      <thead>
        <tr>
          {FIELDS.map((f) => (
            <th key={f.key}>{f.label}</th>
          ))}
          <th className="actions-col">操作</th>
        </tr>
      </thead>
      <tbody>
        {teachers.map((teacher) => (
          <tr key={teacher.id}>
            {FIELDS.map((f) => (
              <td key={f.key}>{teacher[f.key]}</td>
            ))}
            <td className="actions-col">
              <button className="btn btn-sm" onClick={() => onEdit(teacher)}>
                编辑
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => onDelete(teacher)}>
                删除
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
