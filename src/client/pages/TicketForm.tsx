import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createTicket } from '../api'
import { useSession } from '../hooks/useSession'
import { Alert } from '../components/common'
import type { Priority } from '../api/types'
import { FetchError } from '../api/client'

export default function TicketForm() {
  const navigate = useNavigate()
  const { session } = useSession()
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState<Priority>('P2')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const canSubmit = session?.capabilities.includes('submit_ticket')

  const handleSubmit = async () => {
    const errs: Record<string, string> = {}
    if (!subject.trim()) errs.subject = '请输入主题'
    else if (subject.length > 200) errs.subject = '主题不能超过 200 字'
    if (!description.trim()) errs.description = '请输入描述'
    else if (description.length > 5000) errs.description = '描述不能超过 5000 字'
    if (!category.trim()) errs.category = '请输入分类'
    else if (category.length > 64) errs.category = '分类不能超过 64 字'

    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSubmitting(true)
    setError(null)
    try {
      const resp = await createTicket({
        subject: subject.trim(),
        description: description.trim(),
        category: category.trim(),
        priority,
      })
      navigate(`/tickets/${resp.ticket.id}`)
    } catch (e) {
      if (e instanceof FetchError) {
        if (e.code === 'VALIDATION_FAILED' && e.details) {
          const fields = (e.details as Record<string, string[]>).fields
          if (fields) {
            const fe: Record<string, string> = {}
            for (const [k, v] of Object.entries(fields)) {
              fe[k] = Array.isArray(v) ? v.join('; ') : String(v)
            }
            setFieldErrors(fe)
          }
        }
        setError(e.message)
      } else {
        setError('提交失败，请重试')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">提交工单</div>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/tickets')}>返回列表</button>
      </div>

      {!canSubmit && (
        <Alert type="warning">当前身份无提交工单的能力</Alert>
      )}

      {error && <Alert type="error">{error}</Alert>}

      <div className="card" style={{ maxWidth: 640 }}>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">主题<span className="required">*</span></label>
            <input
              className={`form-input ${fieldErrors.subject ? 'error' : ''}`}
              value={subject}
              onChange={e => setSubject(e.target.value)}
              maxLength={200}
              disabled={!canSubmit}
            />
            {fieldErrors.subject && <div className="form-error">{fieldErrors.subject}</div>}
          </div>

          <div className="form-group">
            <label className="form-label">描述<span className="required">*</span></label>
            <textarea
              className={`form-textarea ${fieldErrors.description ? 'error' : ''}`}
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={6}
              maxLength={5000}
              disabled={!canSubmit}
            />
            {fieldErrors.description && <div className="form-error">{fieldErrors.description}</div>}
          </div>

          <div className="form-group">
            <label className="form-label">问题分类<span className="required">*</span></label>
            <input
              className={`form-input ${fieldErrors.category ? 'error' : ''}`}
              value={category}
              onChange={e => setCategory(e.target.value)}
              maxLength={64}
              placeholder="如：硬件故障、网络、软件问题"
              disabled={!canSubmit}
            />
            {fieldErrors.category && <div className="form-error">{fieldErrors.category}</div>}
          </div>

          <div className="form-group">
            <label className="form-label">SLA 优先级<span className="required">*</span></label>
            <select
              className="form-select"
              value={priority}
              onChange={e => setPriority(e.target.value as Priority)}
              disabled={!canSubmit}
            >
              <option value="P0">P0 — 紧急</option>
              <option value="P1">P1 — 高</option>
              <option value="P2">P2 — 中</option>
              <option value="P3">P3 — 低</option>
              <option value="P4">P4 — 最低</option>
            </select>
          </div>

          <div className="flex gap-8">
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={submitting || !canSubmit}
            >
              {submitting ? '提交中...' : '提交'}
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/tickets')}>取消</button>
          </div>
        </div>
      </div>
    </div>
  )
}
