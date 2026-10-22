import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { Teacher, TEACHER_FIELDS } from '../domain/teacher';

interface TeacherTableProps {
  teachers: Teacher[];
  onCreate: () => void;
  onView: (teacher: Teacher) => void;
  onEdit: (teacher: Teacher) => void;
  onDelete: (teacher: Teacher) => void;
}

const COLUMN_LABELS: Record<string, string> = {
  name: '教师名称',
  course: '教授课程',
  grade: '年级',
  phone: '手机',
  email: '邮箱',
};

export function TeacherTable({ teachers, onCreate, onView, onEdit, onDelete }: TeacherTableProps) {
  const total = teachers.length;

  return (
    <section className="panel" aria-labelledby="teacher-list-title">
      <header className="panel-header">
        <div>
          <h2 id="teacher-list-title">教师列表</h2>
          <p className="panel-subtitle">共 {total} 位教师</p>
        </div>
        <button type="button" className="button-primary" onClick={onCreate}>
          <Plus size={16} aria-hidden="true" />
          新增教师
        </button>
      </header>

      <div className="table-scroll">
        <table className="data-table">
          <caption className="visually-hidden">教师列表</caption>
          <thead>
            <tr>
              {TEACHER_FIELDS.map((field) => (
                <th key={field} scope="col">
                  {COLUMN_LABELS[field]}
                </th>
              ))}
              <th scope="col" className="column-actions">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {total === 0 ? (
              <tr>
                <td className="empty-cell" colSpan={TEACHER_FIELDS.length + 1}>
                  暂无教师记录，点击「新增教师」添加第一条记录。
                </td>
              </tr>
            ) : (
              teachers.map((teacher) => (
                <tr key={teacher.id}>
                  <td className="cell-name">{teacher.name}</td>
                  <td>{teacher.course || '—'}</td>
                  <td>{teacher.grade || '—'}</td>
                  <td className="cell-mono">{teacher.phone}</td>
                  <td className="cell-mono">{teacher.email}</td>
                  <td className="column-actions">
                    <div className="row-actions">
                      <button
                        type="button"
                        className="button-link"
                        onClick={() => onView(teacher)}
                      >
                        <Eye size={15} aria-hidden="true" />
                        查看
                      </button>
                      <button
                        type="button"
                        className="button-link"
                        onClick={() => onEdit(teacher)}
                      >
                        <Pencil size={15} aria-hidden="true" />
                        编辑
                      </button>
                      <button
                        type="button"
                        className="button-link button-link-danger"
                        onClick={() => onDelete(teacher)}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}