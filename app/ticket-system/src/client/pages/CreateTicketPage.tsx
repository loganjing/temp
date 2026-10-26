import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiRequest } from '../platform/api-client'
import { PRIORITIES, type Ticket } from '../types/ticket'

// 工单创建页：主题、描述、分类、SLA 优先级（P0-P4）。
export default function CreateTicketPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      const ticket = await apiRequest<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify(body) })
      navigate(`/tickets/${encodeURIComponent(ticket.id)}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <div className="section-heading"><h2>创建工单</h2></div>
      <form className="stack" onSubmit={(event) => void submit(event)} style={{ maxWidth: 560 }}>
        <label>主题<input name="subject" required maxLength={200} /></label>
        <label>描述<textarea name="description" required rows={5} className="w-full" style={{ minHeight: 120 }} /></label>
        <label>分类<input name="category" required maxLength={100} /></label>
        <label>SLA 优先级
          <select name="priority" defaultValue="P2">
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="flex gap-2">
          <button disabled={busy}>{busy ? '提交中…' : '提交'}</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => navigate('/workbench')}>取消</button>
        </div>
      </form>
    </section>
  )
}
