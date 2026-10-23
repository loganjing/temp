import { useState, type FormEvent } from 'react'
import { ticketApi, formatDateTime, type TicketReply } from '../api/ticket-api'
import { useToast } from './Toast'

interface Props {
  ticketId: string
  replies: TicketReply[]
  onReplyAdded: () => void
  canReply: boolean
}

export default function ReplyStream({ ticketId, replies, onReplyAdded, canReply }: Props) {
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const showToast = useToast()

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!content.trim()) return
    setBusy(true)
    try {
      await ticketApi.addReply(ticketId, content.trim())
      setContent('')
      onReplyAdded()
      showToast('回复已发送')
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : '回复失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h3 style={{ margin: '0 0 0.75rem' }}>回复记录 ({replies.length})</h3>
      {replies.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>暂无回复</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '320px', overflowY: 'auto' }}>
          {replies.map((reply) => (
            <div key={reply.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                <strong style={{ fontSize: '0.9rem' }}>{reply.replierName}</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{formatDateTime(reply.createdAt)}</span>
              </div>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {reply.content}
              </p>
            </div>
          ))}
        </div>
      )}
      {canReply && (
        <form onSubmit={(event) => void submit(event)} style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
          <input
            value={content}
            onChange={(event) => setContent(event.currentTarget.value)}
            placeholder="输入回复内容…"
            maxLength={2000}
            style={{ flex: 1 }}
          />
          <button disabled={busy || !content.trim()}>{busy ? '发送中…' : '回复'}</button>
        </form>
      )}
    </section>
  )
}
