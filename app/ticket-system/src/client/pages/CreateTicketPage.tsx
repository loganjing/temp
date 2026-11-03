import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ticketApi, type Priority } from '../platform/api-client'
import { PRIORITIES, PRIORITY_LABELS, ErrorBanner } from '../components/ui'

export default function CreateTicketPage() {
  const navigate = useNavigate()
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState<Priority>('P2')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const created = await ticketApi.create({ subject: subject.trim(), description: description.trim(), category: category.trim(), priority })
      navigate(`/tickets/${created.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败')
    } finally { setBusy(false) }
  }

  return (
    <section className="card form-card">
      <h2>创建工单</h2>
      <p className="muted">填写工单信息，提交后系统将按分类规则自动分配业务组。</p>
      {error && <ErrorBanner message={error} />}
      <form className="stack" onSubmit={(e) => void submit(e)}>
        <label>主题<input value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={200} placeholder="简述问题" /></label>
        <label>描述<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} required placeholder="详细描述问题现象与影响" /></label>
        <label>问题分类<input value={category} onChange={(e) => setCategory(e.target.value)} required maxLength={100} placeholder="如：账号问题、系统故障" /></label>
        <label>SLA 优先级<select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
        </select></label>
        <div className="row-actions"><button disabled={busy}>{busy ? '提交中…' : '提交工单'}</button></div>
      </form>
    </section>
  )
}
