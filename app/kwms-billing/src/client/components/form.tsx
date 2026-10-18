import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

// 表单字段组件：label + 控件 + 字段级错误定位（中文提示落到具体字段）。

export interface Option { value: string; label: string }

function FieldShell({ label, required, error, hint, children }: {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <span className="required" aria-hidden="true">*</span>}
      </span>
      {children}
      {error && <span className="field-error" role="alert">{error}</span>}
      {!error && hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function InputField({ label, required, error, hint, ...inputProps }: {
  label: string
  required?: boolean
  error?: string
  hint?: string
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell label={label} required={required} error={error} hint={hint}>
      <input className="input" {...inputProps} />
    </FieldShell>
  )
}

export function DateField({ label, required, error, hint, ...inputProps }: {
  label: string
  required?: boolean
  error?: string
  hint?: string
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell label={label} required={required} error={error} hint={hint}>
      <input type="date" className="input" {...inputProps} />
    </FieldShell>
  )
}

export function SelectField({ label, required, error, hint, options, placeholder = '请选择', allowEmpty = true, onChange, ...selectProps }: {
  label: string
  required?: boolean
  error?: string
  hint?: string
  options: Option[]
  placeholder?: string
  allowEmpty?: boolean
  onChange: (value: string) => void
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'>) {
  return (
    <FieldShell label={label} required={required} error={error} hint={hint}>
      <select className="select" {...selectProps} onChange={(event) => onChange(event.currentTarget.value)}>
        {allowEmpty && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </FieldShell>
  )
}

export function TextareaField({ label, required, error, hint, ...textareaProps }: {
  label: string
  required?: boolean
  error?: string
  hint?: string
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell label={label} required={required} error={error} hint={hint}>
      <textarea className="textarea" {...textareaProps} />
    </FieldShell>
  )
}

export function CheckField({ label, checked, onChange, disabled }: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="check-line">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      {label}
    </label>
  )
}
