import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiRequest } from '../platform/api-client'
import { Toast } from '../components/StateViews'
import type { Ticket, SLAPriority } from '../types'

export function CreateTicketPage() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')
    const formData = new FormData(event.currentTarget)
    const body = {
      subject: String(formData.get('subject') ?? ''),
      description: String(formData.get('description') ?? ''),
      category: String(formData.get('category') ?? ''),
      slaPriority: String(formData.get('slaPriority') ?? 'P3') as SLAPriority,
    }
    try {
      const ticket = await apiRequest<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify(body) })
      setSuccess('工单创建成功')
      setTimeout(() => navigate(`/tickets/${ticket.id}`), 600)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>创建工单</h1>
      </div>
      <div className="card form-card">
        <form onSubmit={(event) => void submit(event)} className="stack">
          <label>主题<input name="subject" required maxLength={200} placeholder="请输入工单主题" /></label>
          <label>描述<textarea name="description" rows={6} placeholder="请描述问题详情" /></label>
          <label>分类<input name="category" required maxLength={100} placeholder="例如：网络故障、账号问题" /></label>
          <label>SLA 优先级
            <select name="slaPriority" defaultValue="P3">
              <option value="P0">P0 — 最高优先级</option>
              <option value="P1">P1 — 高优先级</option>
              <option value="P2">P2 — 中优先级</option>
              <option value="P3">P3 — 低优先级</option>
              <option value="P4">P4 — 最低优先级</option>
            </select>
          </label>
          <Toast message={error} type="error" />
          <Toast message={success} />
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => navigate('/')}>取消</button>
            <button disabled={busy}>{busy ? '提交中…' : '提交工单'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
