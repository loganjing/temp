import { useState, type FormEvent } from 'react'
import { ticketApi, ApiRequestError } from '../platform/api'

const CATEGORIES = ['技术问题', '功能需求', '账户问题', '性能问题', '其他']
const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4']

export default function TicketCreate({ onCreated }: { onCreated: (id: string) => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    try {
      const ticket = await ticketApi.create({
        subject: body.subject as string,
        description: body.description as string,
        category: body.category as string,
        sla_priority: body.sla_priority as string,
      })
      form.reset()
      onCreated(ticket.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败')
    } finally { setBusy(false) }
  }

  return (
    <section className="card">
      <h2>创建工单</h2>
      <form onSubmit={(event) => void submit(event)} className="form-grid">
        <label style={{ gridColumn: '1 / -1' }}>主题<input name="subject" required maxLength={200} /></label>
        <label style={{ gridColumn: '1 / -1' }}>描述<textarea name="description" required rows={4} style={{ width: '100%', minHeight: '80px', padding: '0.5rem 0.65rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)', color: 'var(--text)', resize: 'vertical' }} /></label>
        <label>分类<select name="category" required>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label>SLA 优先级<select name="sla_priority" required>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
        {error && <p role="alert" className="error" style={{ gridColumn: '1 / -1' }}>{error}</p>}
        <button disabled={busy} style={{ gridColumn: '1 / -1' }}>{busy ? '提交中…' : '提交工单'}</button>
      </form>
    </section>
  )
}
