import { useState, useEffect, type ReactNode, type FormEvent } from 'react';
import { Modal } from './Modal';

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'datetime-local' | 'textarea';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string;
  min?: number;
  step?: string;
}

export interface FormModalProps {
  open: boolean;
  title: string;
  fields: FormField[];
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  submitLabel?: string;
}

export function FormModal({
  open,
  title,
  fields,
  onClose,
  onSubmit,
  submitLabel = '提交',
}: FormModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // 打开时重置表单
  useEffect(() => {
    if (open) {
      setValues({});
      setErrors({});
      setSubmitting(false);
    }
  }, [open]);

  function getValue(field: FormField): string {
    return values[field.name] ?? field.defaultValue ?? '';
  }

  function handleChange(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    for (const field of fields) {
      if (field.required && !getValue(field).trim()) {
        newErrors[field.name] = `${field.label}为必填项`;
      }
      if (field.type === 'number' && getValue(field)) {
        const num = Number(getValue(field));
        if (isNaN(num)) {
          newErrors[field.name] = `${field.label}必须为数字`;
        } else if (field.min !== undefined && num <= field.min) {
          newErrors[field.name] = `${field.label}必须大于${field.min}`;
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit(values);
      setValues({});
      setErrors({});
    } catch {
      // 错误由调用方通过 Toast 处理
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            取消
          </button>
          <button
            type="submit"
            form="formmodal-form"
            className="btn btn--primary"
            disabled={submitting}
          >
            {submitting ? '提交中...' : submitLabel}
          </button>
        </>
      }
    >
      <form id="formmodal-form" onSubmit={handleSubmit} className="form">
        {fields.map((field) => (
          <div key={field.name} className="form__field">
            <label className="form__label">
              {field.label}
              {field.required && <span className="form__required">*</span>}
            </label>
            {renderField(field, getValue(field), (v) => handleChange(field.name, v))}
            {errors[field.name] && (
              <span className="form__error">{errors[field.name]}</span>
            )}
          </div>
        ))}
      </form>
    </Modal>
  );
}

function renderField(
  field: FormField,
  value: string,
  onChange: (value: string) => void,
): ReactNode {
  switch (field.type) {
    case 'select':
      return (
        <select
          className="form__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">请选择{field.label}</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    case 'textarea':
      return (
        <textarea
          className="form__input form__textarea"
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          className="form__input"
          value={value}
          placeholder={field.placeholder}
          min={field.min}
          step={field.step || '0.01'}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'date':
      return (
        <input
          type="date"
          className="form__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'datetime-local':
      return (
        <input
          type="datetime-local"
          className="form__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <input
          type="text"
          className="form__input"
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
