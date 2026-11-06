import { useState, type FormEvent } from 'react'
import { apiRequest, ApiRequestError } from '../platform/api-client'

type VisitorRegistration = {
  id: number
  status: string
}

type RegisterPayload = {
  name: string
  phone: string
  id_card: string
  company: string
  visit_reason: string
  host_person: string
  expected_arrival_time: string
  license_plate?: string | null
}

const REQUIRED_FIELDS: { key: keyof RegisterPayload; label: string; maxLength?: number }[] = [
  { key: 'name', label: '姓名', maxLength: 50 },
  { key: 'phone', label: '手机号', maxLength: 20 },
  { key: 'id_card', label: '身份证号', maxLength: 32 },
  { key: 'company', label: '公司', maxLength: 100 },
  { key: 'visit_reason', label: '访问事由', maxLength: 500 },
  { key: 'host_person', label: '被访人', maxLength: 50 },
]

const EMPTY_FORM: Record<keyof RegisterPayload, string> = {
  name: '',
  phone: '',
  id_card: '',
  company: '',
  visit_reason: '',
  host_person: '',
  expected_arrival_time: '',
  license_plate: '',
}

export default function RegisterPage() {
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const update = (key: keyof RegisterPayload, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const validate = (): string[] => {
    const missing: string[] = []
    const errors: Record<string, string> = {}
    for (const { key, label } of REQUIRED_FIELDS) {
      if (!form[key].trim()) {
        missing.push(label)
        errors[key] = `${label}不能为空`
      }
    }
    if (!form.expected_arrival_time) {
      missing.push('预计到访时间')
      errors.expected_arrival_time = '预计到访时间不能为空'
    }
    setFieldErrors(errors)
    return missing
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    setSubmitError('')
    const missing = validate()
    if (missing.length > 0) {
      setSubmitError(`请填写以下必填字段：${missing.join('、')}`)
      return
    }
    setSubmitting(true)
    try {
      const payload: RegisterPayload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        id_card: form.id_card.trim(),
        company: form.company.trim(),
        visit_reason: form.visit_reason.trim(),
        host_person: form.host_person.trim(),
        expected_arrival_time: form.expected_arrival_time,
        license_plate: form.license_plate.trim() || null,
      }
      const result = await apiRequest<VisitorRegistration>('/api/visitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setSuccess(true)
      setForm({ ...EMPTY_FORM })
      setFieldErrors({})
      return result
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setSubmitError(error.status === 400 ? error.message : `提交失败：${error.message}`)
      } else {
        setSubmitError('提交失败，请稍后重试')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <span className="text-2xl text-green-600">✓</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-800">登记已提交</h2>
          <p className="mt-1 text-sm text-gray-500">您的访客登记已提交，请等待审批。</p>
          <button
            type="button"
            onClick={() => setSuccess(false)}
            className="mt-6 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white active:bg-blue-700"
          >
            再登记一位
          </button>
        </div>
      </div>
    )
  }

  const inputClass =
    'w-full rounded-xl border px-3 py-2.5 text-base text-gray-900 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
  const errorInputClass = 'border-red-400 focus:border-red-500 focus:ring-red-500'
  const labelClass = 'mb-1 block text-sm font-medium text-gray-700'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-md px-4 py-3">
          <h1 className="text-center text-base font-semibold text-gray-800">访客登记</h1>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-5">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {REQUIRED_FIELDS.slice(0, 4).map(({ key, label, maxLength }) => (
            <div key={key}>
              <label className={labelClass} htmlFor={key}>
                {label}<span className="text-red-500"> *</span>
              </label>
              <input
                id={key}
                type="text"
                maxLength={maxLength}
                value={form[key]}
                onChange={(e) => update(key, e.target.value)}
                className={`${inputClass} ${fieldErrors[key] ? errorInputClass : 'border-gray-300'}`}
                placeholder={`请输入${label}`}
              />
              {fieldErrors[key] && <p className="mt-1 text-xs text-red-500">{fieldErrors[key]}</p>}
            </div>
          ))}
          <div>
            <label className={labelClass} htmlFor="visit_reason">
              访问事由<span className="text-red-500"> *</span>
            </label>
            <textarea
              id="visit_reason"
              maxLength={500}
              rows={3}
              value={form.visit_reason}
              onChange={(e) => update('visit_reason', e.target.value)}
              className={`${inputClass} ${fieldErrors.visit_reason ? errorInputClass : 'border-gray-300'} resize-none`}
              placeholder="请输入访问事由"
            />
            {fieldErrors.visit_reason && <p className="mt-1 text-xs text-red-500">{fieldErrors.visit_reason}</p>}
          </div>
          <div>
            <label className={labelClass} htmlFor="host_person">
              被访人<span className="text-red-500"> *</span>
            </label>
            <input
              id="host_person"
              type="text"
              maxLength={50}
              value={form.host_person}
              onChange={(e) => update('host_person', e.target.value)}
              className={`${inputClass} ${fieldErrors.host_person ? errorInputClass : 'border-gray-300'}`}
              placeholder="请输入被访人姓名"
            />
            {fieldErrors.host_person && <p className="mt-1 text-xs text-red-500">{fieldErrors.host_person}</p>}
          </div>
          <div>
            <label className={labelClass} htmlFor="expected_arrival_time">
              预计到访时间<span className="text-red-500"> *</span>
            </label>
            <input
              id="expected_arrival_time"
              type="datetime-local"
              value={form.expected_arrival_time}
              onChange={(e) => update('expected_arrival_time', e.target.value)}
              className={`${inputClass} ${fieldErrors.expected_arrival_time ? errorInputClass : 'border-gray-300'}`}
            />
            {fieldErrors.expected_arrival_time && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.expected_arrival_time}</p>
            )}
          </div>
          <div>
            <label className={labelClass} htmlFor="license_plate">
              车牌号<span className="text-gray-400">（选填）</span>
            </label>
            <input
              id="license_plate"
              type="text"
              maxLength={20}
              value={form.license_plate}
              onChange={(e) => update('license_plate', e.target.value)}
              className={`${inputClass} border-gray-300`}
              placeholder="请输入车牌号"
            />
          </div>
          {submitError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
              {submitError}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-blue-600 py-3 text-base font-medium text-white transition active:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? '提交中...' : '提交登记'}
          </button>
        </form>
      </main>
    </div>
  )
}
