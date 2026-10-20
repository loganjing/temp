import { useState, type FormEvent } from 'react'
import { apiErrorText } from '../../api/helpers'
import { submitRating } from '../../api/tickets'
import type { Ticket } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { formatDateTime } from '../../format'
import { useToast } from '../Toast'

export function RatingSection({ ticket, onMutated }: { ticket: Ticket; onMutated: () => void }) {
  const { user } = useAuth()
  const toast = useToast()
  const [score, setScore] = useState(5)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user) return null
  const isTicketSubmitter = user.id === ticket.submitter.id
  const canRate = user.role === 'submitter' && isTicketSubmitter && ticket.status === 'COMPLETED' && !ticket.rating

  if (ticket.rating) {
    return (
      <div className="card-base p-4">
        <h3 className="section-title">满意度评价</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Stars score={ticket.rating.score} />
          <span className="text-sm font-medium text-slate-700">{ticket.rating.score} 分</span>
          <span className="text-xs text-slate-400">{formatDateTime(ticket.rating.ratedAt)}</span>
        </div>
        {ticket.rating.comment && (
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{ticket.rating.comment}</p>
        )}
        <p className="mt-2 text-xs text-slate-400">评价人：提交人（{ticket.submitter.name}）</p>
      </div>
    )
  }

  if (canRate) {
    const submit = async (event: FormEvent) => {
      event.preventDefault()
      setSubmitting(true)
      setError(null)
      try {
        await submitRating(ticket.id, score, comment.trim() || undefined)
        toast.push('success', '评价提交成功')
        onMutated()
      } catch (err) {
        setError(apiErrorText(err))
      } finally {
        setSubmitting(false)
      }
    }
    return (
      <form onSubmit={submit} className="card-base space-y-3 p-4">
        <h3 className="section-title">满意度评价</h3>
        <p className="text-xs text-slate-400">工单已完成，请对本次处理进行满意度评价（1-5 分，提交后不可修改）。</p>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => setScore(n)}
              aria-label={`${n} 分`}
              className={`text-2xl leading-none hover:text-amber-400 ${n <= score ? 'text-amber-500' : 'text-slate-300'}`}
            >
              ★
            </button>
          ))}
          <span className="ml-2 text-sm text-slate-500">{score} 分</span>
        </div>
        <textarea
          value={comment}
          onChange={event => setComment(event.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="评价留言（选填，最多 1000 字）"
          className="input-base resize-y"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? '提交中…' : '提交评价'}
          </button>
        </div>
      </form>
    )
  }

  if (ticket.status === 'COMPLETED') {
    return (
      <div className="card-base p-4">
        <h3 className="section-title">满意度评价</h3>
        <p className="mt-2 text-sm text-slate-400">该工单暂未评价，等待提交人评价。</p>
      </div>
    )
  }
  return null
}

function Stars({ score }: { score: number }) {
  return (
    <span className="text-amber-500" aria-label={`${score} 分`}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} className={n <= score ? '' : 'text-slate-300'}>
          ★
        </span>
      ))}
    </span>
  )
}
