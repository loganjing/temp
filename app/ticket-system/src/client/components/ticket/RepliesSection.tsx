import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiErrorText } from '../../api/helpers'
import { createReply, fetchReplies } from '../../api/tickets'
import type { Reply, Ticket } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { formatDateTime, roleLabelOf } from '../../format'
import { useToast } from '../Toast'
import { EmptyState, ErrorBanner, SkeletonBlock } from '../ui'

export function RepliesSection({ ticket, onMutated }: { ticket: Ticket; onMutated: () => void }) {
  const { user } = useAuth()
  const toast = useToast()
  const [replies, setReplies] = useState<Reply[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)

  const ticketId = ticket.id
  const refresh = useCallback(async () => {
    setError(null)
    try {
      const result = await fetchReplies(ticketId)
      setReplies(result.items)
    } catch (err) {
      setError(apiErrorText(err))
    }
  }, [ticketId])

  useEffect(() => {
    setReplies(null)
    void refresh()
  }, [refresh])

  if (!user) return null

  const open = ticket.status === 'PENDING_ASSIGNMENT' || ticket.status === 'PROCESSING'
  const canReply =
    open &&
    (user.role === 'handler' || user.role === 'admin' || (user.role === 'submitter' && user.companyId === ticket.companyId))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = content.trim()
    if (!text) return
    setSending(true)
    setError(null)
    try {
      await createReply(ticketId, text)
      setContent('')
      toast.push('success', '回复成功')
      await refresh()
      onMutated()
    } catch (err) {
      setError(apiErrorText(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="card-base p-4">
      <h3 className="section-title">
        回复沟通
        {replies && replies.length > 0 && <span className="ml-2 text-xs font-normal text-slate-400">{replies.length} 条</span>}
      </h3>
      <div className="mt-3 space-y-3">
        {error ? (
          <ErrorBanner message={error} onRetry={() => void refresh()} />
        ) : replies === null ? (
          <div className="space-y-2">
            <SkeletonBlock className="h-16 w-full" />
            <SkeletonBlock className="h-12 w-full" />
          </div>
        ) : replies.length === 0 ? (
          <EmptyState title="暂无回复" description="提交人与处理方可在此多轮沟通" />
        ) : (
          replies.map(reply => (
            <div key={reply.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{reply.authorName}</span>
                <span className="rounded bg-white px-1.5 py-0.5">{roleLabelOf(reply.authorRole)}</span>
                <span>{formatDateTime(reply.createdAt)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-slate-800">{reply.content}</p>
            </div>
          ))
        )}
      </div>
      {canReply ? (
        <form onSubmit={submit} className="mt-4 space-y-2">
          <textarea
            value={content}
            onChange={event => setContent(event.target.value)}
            rows={3}
            maxLength={5000}
            placeholder="输入回复内容（1-5000 字）"
            className="input-base resize-y"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">回复将记录回复人与回复时间</span>
            <button type="submit" disabled={sending || !content.trim()} className="btn-primary">
              {sending ? '发送中…' : '发送回复'}
            </button>
          </div>
        </form>
      ) : (
        replies !== null && replies.length > 0 && !open && <p className="mt-3 text-xs text-slate-400">工单已关闭，不能再回复</p>
      )}
    </div>
  )
}
