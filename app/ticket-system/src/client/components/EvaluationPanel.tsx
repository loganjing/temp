import { useEffect, useState } from 'react'
import { ticketApi, formatDateTime, type TicketEvaluation } from '../api/ticket-api'
import { useToast } from './Toast'

interface Props {
  ticketId: string
  isCompleted: boolean
  isSubmitter: boolean
}

export default function EvaluationPanel({ ticketId, isCompleted, isSubmitter }: Props) {
  const [evaluation, setEvaluation] = useState<TicketEvaluation | null>(null)
  const [loading, setLoading] = useState(true)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const showToast = useToast()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ticketApi.getEvaluation(ticketId)
      .then((data) => { if (!cancelled) setEvaluation(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ticketId])

  if (!isCompleted) return null
  if (loading) return <section className="card"><p style={{ color: 'var(--muted)' }}>加载评价…</p></section>

  if (evaluation) {
    return (
      <section className="card">
        <h3 style={{ margin: '0 0 0.5rem' }}>满意度评价</h3>
        <div style={{ display: 'flex', gap: '0.2rem', fontSize: '1.2rem' }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} style={{ color: n <= evaluation.rating ? 'var(--accent)' : 'var(--border)' }}>★</span>
          ))}
        </div>
        {evaluation.comment && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: 'var(--muted)' }}>{evaluation.comment}</p>
        )}
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>{formatDateTime(evaluation.createdAt)}</p>
      </section>
    )
  }

  if (!isSubmitter) return null

  if (!showForm) {
    return (
      <section className="card">
        <h3 style={{ margin: 0 }}>满意度评价</h3>
        <button className="secondary" style={{ marginTop: '0.5rem' }} onClick={() => setShowForm(true)}>去评价</button>
      </section>
    )
  }

  const submit = async () => {
    if (rating < 1 || rating > 5) return
    setBusy(true)
    try {
      const result = await ticketApi.submitEvaluation(ticketId, rating, comment.trim() || null)
      setEvaluation(result)
      setShowForm(false)
      showToast('评价已提交')
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : '评价失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h3 style={{ margin: '0 0 0.5rem' }}>满意度评价</h3>
      <div style={{ display: 'flex', gap: '0.2rem', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className="secondary"
            style={{
              minHeight: 'auto', padding: '0.1rem 0.3rem', border: 'none', background: 'none',
              color: n <= rating ? 'var(--accent)' : 'var(--border)', fontSize: 'inherit', cursor: 'pointer',
            }}
            onClick={() => setRating(n)}
          >★</button>
        ))}
      </div>
      <label style={{ marginBottom: '0.5rem' }}>评价内容（可选）
        <textarea
          value={comment}
          onChange={(event) => setComment(event.currentTarget.value)}
          maxLength={500}
          style={{ width: '100%', minHeight: '60px', padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px', resize: 'vertical', font: 'inherit', background: 'var(--surface)', color: 'var(--text)' }}
        />
      </label>
      <button disabled={busy || rating === 0} onClick={() => void submit()}>{busy ? '提交中…' : '提交评价'}</button>
    </section>
  )
}
