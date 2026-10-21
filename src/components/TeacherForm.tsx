import { useState, type FormEvent } from 'react';
import type { Teacher, TeacherDraft } from '../types';
import { validateTeacherDraft } from '../validation';

interface TeacherFormProps {
  /** 编辑时预填该教师当前字段值；新增时为 undefined */
  initial?: Teacher;
  submitLabel: string;
  onSubmit: (draft: TeacherDraft) => void;
  onCancel: () => void;
}

type FieldName = keyof TeacherDraft;

const FIELD_DEFS: Array<{
  name: FieldName;
  label: string;
  required: boolean;
  placeholder: string;
  type: 'text' | 'tel' | 'email';
}> = [
  { name: 'name', label: '教师名称', required: true, placeholder: '请输入教师姓名', type: 'text' },
  { name: 'course', label: '教授课程', required: false, placeholder: '例如：数学', type: 'text' },
  { name: 'grade', label: '年级', required: false, placeholder: '例如：三年级', type: 'text' },
  { name: 'phone', label: '手机', required: false, placeholder: '例如：13800000000', type: 'tel' },
  {
    name: 'email',
    label: '邮箱',
    required: false,
    placeholder: '例如：teacher@example.com',
    type: 'email',
  },
];

/** 新增/编辑表单：校验失败在表单内提示，不触发 onSubmit（不执行写入） */
export default function TeacherForm({ initial, submitLabel, onSubmit, onCancel }: TeacherFormProps) {
  const [values, setValues] = useState<TeacherDraft>({
    name: initial?.name ?? '',
    course: initial?.course ?? '',
    grade: initial?.grade ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});

  const setField = (name: FieldName, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      if (prev[name] === undefined) {
        return prev;
      }
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { draft, errors: validationErrors } = validateTeacherDraft(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    onSubmit(draft);
  };

  return (
    <form className="teacher-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        {FIELD_DEFS.map((field) => {
          const fieldError = errors[field.name];
          return (
            <div className="form-field" key={field.name}>
              <label htmlFor={`teacher-field-${field.name}`}>
                {field.label}
                {field.required && (
                  <span className="required-mark" aria-hidden="true">
                    *
                  </span>
                )}
              </label>
              <input
                id={`teacher-field-${field.name}`}
                name={field.name}
                type={field.type}
                value={values[field.name]}
                placeholder={field.placeholder}
                aria-required={field.required}
                aria-invalid={fieldError !== undefined}
                onChange={(event) => setField(field.name, event.target.value)}
              />
              {fieldError !== undefined && (
                <p className="field-error" role="alert">
                  {fieldError}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
