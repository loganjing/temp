import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { categoryApi, ticketApi } from '../platform/api-client'
import { useAsync } from '../platform/hooks'
import { PRIORITY_LABELS, PRIORITY_ORDER } from '../platform/labels'
import type { SlaPriority } from '../platform/types'
import { ErrorBanner, useToast } from '../platform/ui'

export default function CreateTicketPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const categories = useAsync(() => categoryApi.list(), [])
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [priority, setPriority] = useState<SlaPriority>('P3')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!categoryId) {
      setError('请选择分类 / Please select a category')
      return
    }
    setBusy(true)
    setError('')
    try {
      await ticketApi.create({ subject: subject.trim(), description: description.trim(), categoryId, slaPriority: priority })
      toast.push('工单已创建 / Ticket created', 'success')
      navigate('/')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '创建失败 / Create failed'
      setError(message)
      toast.push(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-grid">
      <section className="card">
        <h2>创建工单 / Create ticket</h2>
        {categories.error && <ErrorBanner message={categories.error} />}
        <form className="stack" onSubmit={submit}>
          <label>主题 / Subject<input value={subject} onChange={(e) => setSubject(e.currentTarget.value)} required maxLength={200} /></label>
          <label>描述 / Description<textarea value={description} onChange={(e) => setDescription(e.currentTarget.value)} rows={6} required maxLength={4000} /></label>
          <label>分类 / Category
            <select value={categoryId} onChange={(e) => setCategoryId(e.currentTarget.value)} required disabled={categories.loading}>
              <option value="">{categories.loading ? '加载中…' : '请选择 / Select…'}</option>
              {categories.data?.items.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <label>SLA 优先级 / Priority
            <select value={priority} onChange={(e) => setPriority(e.currentTarget.value as SlaPriority)}>
              {PRIORITY_ORDER.map((value) => <option key={value} value={value}>{PRIORITY_LABELS[value]}</option>)}
            </select>
          </label>
          {error && <ErrorBanner message={error} />}
          <button disabled={busy}>{busy ? '处理中…' : '提交工单 / Submit'}</button>
        </form>
      </section>
    </div>
  )
}
