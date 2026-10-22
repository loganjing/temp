import { useState } from 'react';
import { X } from 'lucide-react';
import {
  TeacherDraft,
  TEACHER_FIELD_LABELS,
  TeacherErrors,
  hasErrors,
  normalizeTeacherDraft,
  validateTeacher,
} from '../domain/teacher';

interface TeacherFormProps {
  mode: 'create' | 'edit';
  /** 编辑时载入的原始值；新增时为空白草稿。 */
  initialDraft: TeacherDraft;
  onSave: (draft: TeacherDraft) => void;
  onCancel: () => void;
}

const FIELD_HINTS: Partial<Record<keyof TeacherDraft, string>> = {
  name: '必填',
  phone: '11 位手机号，例如 13800000000',
  email: '例如 zhang@example.com',
};

export function TeacherForm({ mode, initialDraft, onSave, onCancel }: TeacherFormProps) {
  const [draft, setDraft] = useState<TeacherDraft>(initialDraft);
  const [errors, setErrors] = useState<TeacherErrors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const title = mode === 'create' ? '新增教师' : '编辑教师';

  function handleFieldChange(field: keyof TeacherDraft, value: string) {
    const nextDraft = { ...draft, [field]: value };
    setDraft(nextDraft);
    // 提交失败后随输入实时复核，帮助用户看到校验何时解除。
    if (submitAttempted) {
      setErrors(validateTeacher(nextDraft));
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);

    const nextErrors = validateTeacher(draft);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      // 校验不通过时阻止保存，由字段级提示指引用户修正。
      return;
    }
    onSave(normalizeTeacherDraft(draft));
  }

  return (
    <div className="modal-layer">
      <div className="modal-backdrop" onClick={onCancel} />
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="teacher-form-title"
      >
        <header className="modal-header">
          <h2 id="teacher-form-title">{title}</h2>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="关闭">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form className="teacher-form" onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            {(Object.keys(TEACHER_FIELD_LABELS) as (keyof TeacherDraft)[]).map((field) => {
              const error = errors[field];
              const hint = FIELD_HINTS[field];
              const errorId = `teacher-${field}-error`;
              const hintId = `teacher-${field}-hint`;
              return (
                <div className="form-field" key={field}>
                  <label htmlFor={`teacher-${field}`}>
                    {TEACHER_FIELD_LABELS[field]}
                    {field === 'name' ? <span className="required-mark">*</span> : null}
                  </label>
                  <input
                    id={`teacher-${field}`}
                    name={field}
                    type="text"
                    value={draft[field]}
                    autoComplete="off"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : hint ? hintId : undefined}
                    onChange={(event) => handleFieldChange(field, event.target.value)}
                  />
                  {error ? (
                    <p className="field-error" id={errorId} role="alert">
                      {error}
                    </p>
                  ) : hint ? (
                    <p className="field-hint" id={hintId}>
                      {hint}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <footer className="modal-actions">
            <button type="button" className="button-secondary" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="button-primary">
              保存
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}