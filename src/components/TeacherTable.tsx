import type { Teacher } from '../types';

const COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'name', label: '教师名称' },
  { key: 'course', label: '教授课程' },
  { key: 'grade', label: '年级' },
  { key: 'phone', label: '手机' },
  { key: 'email', label: '邮箱' },
];

interface TeacherTableProps {
  teachers: Teacher[];
  onEdit: (teacher: Teacher) => void;
  onDelete: (teacher: Teacher) => void;
}

/** 教师列表：行内完整展示五个字段并提供编辑、删除入口（列表即“查看”） */
export default function TeacherTable({ teachers, onEdit, onDelete }: TeacherTableProps) {
  if (teachers.length === 0) {
    return <div className="empty-state">暂无教师记录，点击“新增教师”开始录入。</div>;
  }

  return (
    <table className="teacher-table">
      <thead>
        <tr>
          {COLUMNS.map((column) => (
            <th key={column.key} scope="col">
              {column.label}
            </th>
          ))}
          <th scope="col" className="col-actions">
            操作
          </th>
        </tr>
      </thead>
      <tbody>
        {teachers.map((teacher) => (
          <tr key={teacher.id}>
            <td>{teacher.name}</td>
            <td>{teacher.course}</td>
            <td>{teacher.grade}</td>
            <td>{teacher.phone}</td>
            <td>{teacher.email}</td>
            <td className="col-actions">
              <button type="button" className="btn btn-small" onClick={() => onEdit(teacher)}>
                编辑
              </button>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => onDelete(teacher)}
              >
                删除
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
