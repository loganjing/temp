import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../platform/api'
import type { Priority } from '../platform/contracts'
import { useApp } from '../app-context'

const priorities: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export default function NewTicketPage() {
  const { operatorId, currentUsers, users } = useApp()
  const navigate = useNavigate()

  const operator = users.find((user) => user.id === operatorId) ?? currentUsers[0]

  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState<Priority>('P2')
  const [submitterName, setSubmitterName] = useState(operator?.name ?? '')
  const [submitterEmail, setSubmitterEmail] = useState(operator?.email ?? '')
  const [submitterDepartment, setSubmitterDepartment] = useState(operator?.department ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit =
    !!operatorId &&
    subject.trim().length >= 1 &&
    subject.trim().length <= 200 &&
    description.trim().length > 0 &&
    category.trim().length > 0 &&
    submitterName.trim().length > 0 &&
    submitterEmail.trim().length > 0

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!operatorId || !canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await api.createTicket({
        operatorId,
        subject: subject.trim(),
        description: description.trim(),
        category: category.trim(),
        priority,
        submitter: {
          name: submitterName.trim(),
          email: submitterEmail.trim(),
          department: submitterDepartment.trim() || null,
        },
      })
      navigate('/')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建工单失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-lg font-semibold">新建工单</h1>
      <form className="mt-4 flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">主题（1–200 字符）</span>
          <input
            className="rounded-md border border-slate-300 px-3 py-2"
            value={subject}
            maxLength={200}
            onChange={(event) => setSubject(event.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">描述</span>
          <textarea
            className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
          />
        </label>
        <div className="flex gap-4">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-slate-600">分类</span>
            <input
              className="rounded-md border border-slate-300 px-3 py-2"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="如：网络故障"
              required
            />
          </label>
          <label className="flex w-32 flex-col gap-1 text-sm">
            <span className="text-slate-600">优先级</span>
            <select
              className="rounded-md border border-slate-300 px-3 py-2"
              value={priority}
              onChange={(event) => setPriority(event.target.value as Priority)}
            >
              {priorities.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-sm text-slate-600">提交人信息</legend>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="text-slate-600">姓名</span>
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                value={submitterName}
                onChange={(event) => setSubmitterName(event.target.value)}
                required
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="text-slate-600">邮箱</span>
              <input
                type="email"
                className="rounded-md border border-slate-300 px-3 py-2"
                value={submitterEmail}
                onChange={(event) => setSubmitterEmail(event.target.value)}
                required
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="text-slate-600">部门（可选）</span>
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                value={submitterDepartment}
                onChange={(event) => setSubmitterDepartment(event.target.value)}
              />
            </label>
          </div>
        </fieldset>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            disabled={!canSubmit || submitting}
          >
            {submitting ? '提交中…' : '提交'}
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            onClick={() => navigate('/')}
          >
            取消
          </button>
        </div>
      </form>
    </div>
  )
}
