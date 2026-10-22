import { Pencil, Trash2, X } from 'lucide-react';
import { Teacher, TEACHER_FIELD_LABELS, TEACHER_FIELDS } from '../domain/teacher';

interface TeacherDetailProps {
  teacher: Teacher;
  onClose: () => void;
  onEdit: (teacher: Teacher) => void;
  onDelete: (teacher: Teacher) => void;
}

export function TeacherDetail({ teacher, onClose, onEdit, onDelete }: TeacherDetailProps) {
  return (
    <aside className="detail-drawer" role="dialog" aria-modal="false" aria-labelledby="teacher-detail-title">
      <header className="detail-header">
        <div>
          <h2 id="teacher-detail-title">教师详情</h2>
          <p className="panel-subtitle">{teacher.name}</p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="关闭详情">
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <dl className="detail-list">
        {TEACHER_FIELDS.map((field) => (
          <div className="detail-row" key={field}>
            <dt>{TEACHER_FIELD_LABELS[field]}</dt>
            <dd>{teacher[field] || '—'}</dd>
          </div>
        ))}
      </dl>

      <footer className="detail-actions">
        <button type="button" className="button-secondary" onClick={() => onEdit(teacher)}>
          <Pencil size={15} aria-hidden="true" />
          编辑
        </button>
        <button type="button" className="button-danger" onClick={() => onDelete(teacher)}>
          <Trash2 size={15} aria-hidden="true" />
          删除
        </button>
      </footer>
    </aside>
  );
}