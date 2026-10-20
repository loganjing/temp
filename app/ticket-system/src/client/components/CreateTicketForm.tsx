// 创建工单表单：主题、描述、问题分类、SLA 优先级（P0–P4）。

import { useState } from 'react'
import { createTicket } from '../api'
import { describeApiError } from '../platform/api-client'
import { BASELINE_CATEGORIES, type TicketDetail, type TicketPriority } from '../contracts'

interface CreateTicketFormProps {
  onCreated: (ticket: TicketDetail) => void
  onCancel: () => void
}

const SUBJECT_MAX = 200
const DESCRIPTION_MAX = 5000

export default function CreateTicketForm({ onCreated, onCancel }: CreateTicketFormProps) {
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState<string>(BASELINE_CATEGORIES[0])
  const [priority, setPriority] = useState<TicketPriority>('P2')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError('')
    if (!subject.trim()) {
      setError('请填写工单主题')
      return
    }
    if (!description.trim()) {
      setError('请填写问题描述')
      return
    }
    setBusy(true)
    try {
      const ticket = await createTicket({
        subject: subject.trim(),
        description: description.trim(),
        category,
        priority,
      })
      onCreated(ticket)
    } catch (cause) {
      setError(describeApiError(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold">创建工单</h2>
      <p className="mt-1 text-xs text-slate-500">提交人信息（姓名、公司、部门、邮箱）将按当前账户自动记录。</p>
      <div className="mt-4 space-y-3.5">
        <div>
          <label className="label" htmlFor="create-subject">
            主题 <span className="text-slate-400">（{subject.length}/{SUBJECT_MAX}）</span>
          </label>
          <input
            id="create-subject"
            className="input"
            value={subject}
            onChange={(event) => setSubject(event.currentTarget.value)}
            required
            maxLength={SUBJECT_MAX}
            placeholder="简要描述问题"
          />
        </div>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="create-category">
              问题分类
            </label>
            <select
              id="create-category"
              className="input"
              value={category}
              onChange={(event) => setCategory(event.currentTarget.value)}
            >
              {BASELINE_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="create-priority">
              SLA 优先级
            </label>
            <select
              id="create-priority"
              className="input"
              value={priority}
              onChange={(event) => setPriority(event.currentTarget.value as TicketPriority)}
            >
              {(['P0', 'P1', 'P2', 'P3', 'P4'] as TicketPriority[]).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="create-description">
            问题描述 <span className="text-slate-400">（{description.length}/{DESCRIPTION_MAX}）</span>
          </label>
          <textarea
            id="create-description"
            className="textarea min-h-[120px]"
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
            required
            maxLength={DESCRIPTION_MAX}
            placeholder="详细说明问题现象、影响范围与复现步骤"
          />
        </div>
        {error && (
          <p className="break-words rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? '提交中…' : '提交工单'}
          </button>
        </div>
      </div>
    </section>
  )
}
