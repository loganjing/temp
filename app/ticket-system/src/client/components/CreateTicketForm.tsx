import { useState, type FormEvent } from 'react'
import { apiErrorText } from '../api/helpers'
import { createTicket } from '../api/tickets'
import type { Priority, Ticket } from '../api/types'

const priorityOptions: { value: Priority; label: string }[] = [
  { value: 'P0', label: 'P0 紧急' },
  { value: 'P1', label: 'P1 高' },
  { value: 'P2', label: 'P2 中' },
  { value: 'P3', label: 'P3 普通' },
  { value: 'P4', label: 'P4 低' },
]

export function CreateTicketForm({ onCreated, onCancel }: { onCreated: (ticket: Ticket) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState<Priority>('P3')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()
    const trimmedCategory = category.trim()
    if (!trimmedTitle || !trimmedDescription || !trimmedCategory) {
      setError('请填写主题、描述与分类')
      return
    }
    if (trimmedTitle.length > 200) {
      setError('主题不能超过 200 字')
      return
    }
    if (trimmedDescription.length > 5000) {
      setError('描述不能超过 5000 字')
      return
    }
    if (trimmedCategory.length > 50) {
      setError('分类不能超过 50 字')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const ticket = await createTicket({
        title: trimmedTitle,
        description: trimmedDescription,
        category: trimmedCategory,
        priority,
      })
      onCreated(ticket)
    } catch (err) {
      setError(apiErrorText(err, '创建失败，请稍后重试'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">主题</span>
        <input
          value={title}
          onChange={event => setTitle(event.target.value)}
          maxLength={200}
          placeholder="简要描述问题（1-200 字）"
          className="input-base"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">描述</span>
        <textarea
          value={description}
          onChange={event => setDescription(event.target.value)}
          rows={5}
          maxLength={5000}
          placeholder="详细说明问题现象、影响与期望（1-5000 字）"
          className="input-base resize-y"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">问题分类</span>
          <input
            value={category}
            onChange={event => setCategory(event.target.value)}
            maxLength={50}
            placeholder="如：账号权限"
            className="input-base"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">SLA 优先级</span>
          <select value={priority} onChange={event => setPriority(event.target.value as Priority)} className="input-base">
            {priorityOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-slate-400">
        提交人姓名、公司、部门与邮箱将自动随工单记录；若公司已配置该分类的分配规则，工单将自动分配到对应业务组。
      </p>
      {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          取消
        </button>
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? '提交中…' : '提交工单'}
        </button>
      </div>
    </form>
  )
}
