import { useCallback, useEffect, useState } from 'react'
import type {
  AssignBody,
  BusinessGroup,
  CompleteBody,
  CreateEvaluationBody,
  CreateReplyBody,
  Evaluation,
  TicketDetail,
  TransferBody,
  UserDetail,
} from '../types'
import { PRIORITY_OPTIONS, RATING_LABEL } from '../types'
import { apiGet, apiPost } from '../platform/api-client'
import { ApiRequestError } from '../platform/api-client'
import { LoadingState, ErrorState, FeedbackBanner } from './States'
import { StatusBadge, PriorityBadge } from './Badges'
import SubmitterInfoPanel from './SubmitterInfoPanel'

interface Props {
  ticketId: string
  currentUser: UserDetail
  onUpdated: () => void
  onSelectTicket?: (id: string) => void
}

type Action = 'reply' | 'assign' | 'transfer' | 'complete' | 'cancel' | 'evaluation' | null

export default function TicketDetailPanel({ ticketId, currentUser, onUpdated, onSelectTicket }: Props) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeAction, setActiveAction] = useState<Action>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const fetchTicket = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await apiGet<TicketDetail>(`/api/tickets/${ticketId}`)
      setTicket(d)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载工单详情失败')
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => {
    void fetchTicket()
    setActiveAction(null)
    setFeedback(null)
  }, [fetchTicket])

  const runAction = async (
    label: string,
    fn: () => Promise<unknown>,
    opts?: { closeAfter?: boolean; refresh?: boolean },
  ) => {
    setFeedback(null)
    try {
      await fn()
      setFeedback({ type: 'success', message: `${label}成功` })
      if (opts?.closeAfter !== false) setActiveAction(null)
      if (opts?.refresh !== false) {
        await fetchTicket()
        onUpdated()
      }
    } catch (err) {
      const msg =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : `${label}失败`
      setFeedback({ type: 'error', message: msg })
    }
  }

  if (loading) return <LoadingState label="加载工单详情…" />
  if (error) return <ErrorState message={error} onRetry={fetchTicket} />
  if (!ticket) return null

  const canAssign = ticket.status === 'pending_assign'
  const canTransfer = ticket.status === 'pending_process'
  const canComplete = ticket.status === 'pending_process'
  const canCancel = ticket.status === 'pending_assign' || ticket.status === 'pending_process'
  const canEvaluate = ticket.status === 'completed' && !ticket.evaluation

  return (
    <div className="flex h-full">
      {/* 主信息列 */}
      <div className="flex flex-1 flex-col overflow-y-auto px-6 py-5">
        {/* 头部 */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2">
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              <span className="text-xs text-slate-400">{ticket.categoryName}</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">{ticket.title}</h2>
          </div>
          <span className="flex-shrink-0 font-mono text-[10px] text-slate-300">{ticket.id}</span>
        </div>

        {/* 基本信息 */}
        <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-slate-100 bg-white px-4 py-3 text-xs">
          <Field label="提交人" value={`${ticket.submitterName} (${ticket.submitterEmail})`} />
          <Field label="创建时间" value={formatTime(ticket.createdAt)} />
          <Field
            label="分配业务组"
            value={ticket.assignedGroupName ?? '未分配'}
            muted={!ticket.assignedGroupName}
          />
          <Field
            label="处理人"
            value={ticket.assignedHandlerName ?? ticket.processedByName ?? '未指派'}
            muted={!ticket.assignedHandlerName && !ticket.processedByName}
          />
          {ticket.processedAt && <Field label="完成时间" value={formatTime(ticket.processedAt)} />}
        </dl>

        {/* 描述 */}
        <Section title="工单描述">
          <p className="whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            {ticket.description}
          </p>
        </Section>

        {/* 回复列表 */}
        <Section title={`回复 (${ticket.replies.length})`}>
          {ticket.replies.length === 0 ? (
            <EmptyHint text="暂无回复" />
          ) : (
            <ul className="space-y-2">
              {ticket.replies.map((r) => (
                <li key={r.id} className="rounded-md border border-slate-100 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{r.replierName}</span>
                    <span className="text-slate-400">{formatTime(r.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-600">{r.content}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 转派记录 */}
        {ticket.transfers.length > 0 && (
          <Section title={`转派记录 (${ticket.transfers.length})`}>
            <ul className="space-y-1.5">
              {ticket.transfers.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-xs text-slate-600"
                >
                  <span>{t.fromGroupName ?? '—'}</span>
                  <svg className="h-3 w-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 12h15" />
                  </svg>
                  <span className="font-medium">{t.toGroupName ?? '—'}</span>
                  <span className="ml-auto text-slate-400">
                    操作人 {t.transferredByName} · {formatTime(t.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* 评价 */}
        <Section title="满意度评价">
          {ticket.evaluation ? (
            <EvaluationView evaluation={ticket.evaluation} />
          ) : canEvaluate ? (
            <EmptyHint text="工单已完成，等待评价" />
          ) : (
            <EmptyHint text="暂无评价" />
          )}
        </Section>

        {/* 操作栏 */}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <ActionButton label="回复" onClick={() => setActiveAction('reply')} active={activeAction === 'reply'} />
          {canAssign && (
            <ActionButton
              label="手动分配"
              onClick={() => setActiveAction('assign')}
              active={activeAction === 'assign'}
            />
          )}
          {canTransfer && (
            <ActionButton
              label="转派"
              onClick={() => setActiveAction('transfer')}
              active={activeAction === 'transfer'}
            />
          )}
          {canComplete && (
            <ActionButton
              label="完成"
              variant="primary"
              onClick={() => setActiveAction('complete')}
              active={activeAction === 'complete'}
            />
          )}
          {canCancel && (
            <ActionButton
              label="取消工单"
              variant="danger"
              onClick={() => setActiveAction('cancel')}
              active={activeAction === 'cancel'}
            />
          )}
          {canEvaluate && (
            <ActionButton
              label="评价"
              variant="primary"
              onClick={() => setActiveAction('evaluation')}
              active={activeAction === 'evaluation'}
            />
          )}
        </div>

        {/* 操作反馈 */}
        {feedback && (
          <div className="mt-3">
            <FeedbackBanner type={feedback.type} message={feedback.message} />
          </div>
        )}

        {/* 操作面板 */}
        {activeAction && (
          <div className="animate-fade-in mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            {activeAction === 'reply' && (
              <ReplyForm
                onCancel={() => setActiveAction(null)}
                onSubmit={(content) =>
                  runAction('回复', () =>
                    apiPost(`/api/tickets/${ticketId}/replies`, {
                      replierId: currentUser.id,
                      content,
                    } satisfies CreateReplyBody),
                  )
                }
              />
            )}
            {activeAction === 'assign' && (
              <AssignForm
                companyId={currentUser.companyId}
                onCancel={() => setActiveAction(null)}
                onSubmit={(body) =>
                  runAction('分配', () =>
                    apiPost(`/api/tickets/${ticketId}/assign`, body as AssignBody),
                  )
                }
              />
            )}
            {activeAction === 'transfer' && (
              <TransferForm
                companyId={currentUser.companyId}
                onCancel={() => setActiveAction(null)}
                onSubmit={(body) =>
                  runAction('转派', () =>
                    apiPost(
                      `/api/tickets/${ticketId}/transfer`,
                      { transferredBy: currentUser.id, ...body } satisfies TransferBody,
                    ),
                  )
                }
              />
            )}
            {activeAction === 'complete' && (
              <ConfirmForm
                message="确认完成此工单？完成后将记录处理人和处理时间。"
                onCancel={() => setActiveAction(null)}
                onConfirm={() =>
                  runAction('完成', () =>
                    apiPost(`/api/tickets/${ticketId}/complete`, {
                      processedBy: currentUser.id,
                    } satisfies CompleteBody),
                  )
                }
              />
            )}
            {activeAction === 'cancel' && (
              <ConfirmForm
                message="确认取消此工单？取消后不可恢复。"
                danger
                onCancel={() => setActiveAction(null)}
                onConfirm={() =>
                  runAction('取消', () => apiPost(`/api/tickets/${ticketId}/cancel`))
                }
              />
            )}
            {activeAction === 'evaluation' && (
              <EvaluationForm
                submitterId={ticket.submitterId}
                onCancel={() => setActiveAction(null)}
                onSubmit={(body) =>
                  runAction('评价', () =>
                    apiPost(`/api/tickets/${ticketId}/evaluation`, body satisfies CreateEvaluationBody),
                  )
                }
              />
            )}
          </div>
        )}
      </div>

      {/* 提交人侧边面板 */}
      <aside className="w-72 flex-shrink-0 overflow-y-auto border-l border-slate-200 bg-white px-4 py-5">
        <SubmitterInfoPanel
          submitterId={ticket.submitterId}
          excludeTicketId={ticket.id}
          onSelectTicket={onSelectTicket}
        />
      </aside>
    </div>
  )
}

// ---- 子组件 ----

function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className={muted ? 'text-slate-400' : 'text-slate-700'}>{value}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-xs text-slate-400">{text}</p>
}

function EvaluationView({ evaluation }: { evaluation: Evaluation }) {
  return (
    <div className="rounded-md bg-amber-50 px-3 py-2.5 ring-1 ring-inset ring-amber-100">
      <div className="mb-1 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <svg
            key={n}
            className={`h-4 w-4 ${n <= evaluation.rating ? 'text-amber-400' : 'text-slate-200'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.446a1 1 0 00-.364 1.118l1.286 3.957c.3.921-.755 1.688-1.54 1.118l-3.367-2.446a1 1 0 00-1.176 0l-3.367 2.446c-.784.57-1.838-.197-1.539-1.118l1.285-3.957a1 1 0 00-.363-1.118L2.063 9.384c-.784-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.285-3.957z" />
          </svg>
        ))}
        <span className="ml-1 text-xs font-medium text-amber-700">{RATING_LABEL[evaluation.rating]}</span>
      </div>
      {evaluation.comment && <p className="text-xs text-slate-600">{evaluation.comment}</p>}
      <p className="mt-1 text-[10px] text-slate-400">{formatTime(evaluation.createdAt)}</p>
    </div>
  )
}

function ActionButton({
  label,
  onClick,
  active,
  variant = 'default',
}: {
  label: string
  onClick: () => void
  active?: boolean
  variant?: 'default' | 'primary' | 'danger'
}) {
  const base = 'rounded-md px-3 py-1.5 text-xs font-medium transition-colors'
  const styles =
    variant === 'primary'
      ? active
        ? 'bg-indigo-700 text-white'
        : 'bg-indigo-600 text-white hover:bg-indigo-700'
      : variant === 'danger'
        ? active
          ? 'bg-red-600 text-white'
          : 'border border-red-200 text-red-600 hover:bg-red-50'
        : active
          ? 'bg-slate-200 text-slate-800'
          : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
  return (
    <button className={`${base} ${styles}`} onClick={onClick}>
      {label}
    </button>
  )
}

// ---- 操作表单 ----

function ReplyForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (content: string) => void }) {
  const [content, setContent] = useState('')
  return (
    <FormShell title="添加回复" onCancel={onCancel}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        placeholder="输入回复内容…"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
      />
      <SubmitRow onCancel={onCancel} onSubmit={() => content.trim() && onSubmit(content.trim())} disabled={!content.trim()} />
    </FormShell>
  )
}

function GroupSelectForm({
  title,
  companyId,
  onCancel,
  onSubmit,
  allowHandler,
}: {
  title: string
  companyId: string
  onCancel: () => void
  onSubmit: (groupId: string | undefined, handlerId: string | undefined) => void
  allowHandler?: boolean
}) {
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [groupId, setGroupId] = useState('')
  const [handlerId, setHandlerId] = useState('')

  useEffect(() => {
    let cancelled = false
    apiGet<{ items: BusinessGroup[] }>(`/api/companies/${companyId}/business-groups`)
      .then((r) => !cancelled && setGroups(r.items ?? []))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [companyId])

  return (
    <FormShell title={title} onCancel={onCancel}>
      {loading ? (
        <p className="text-xs text-slate-400">加载业务组…</p>
      ) : groups.length === 0 ? (
        <p className="text-xs text-slate-400">当前公司暂无业务组</p>
      ) : (
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
        >
          <option value="">选择目标业务组…</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      )}
      {allowHandler && (
        <input
          value={handlerId}
          onChange={(e) => setHandlerId(e.target.value)}
          placeholder="处理人用户 ID（可选）"
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
        />
      )}
      <SubmitRow
        onCancel={onCancel}
        onSubmit={() => onSubmit(groupId || undefined, handlerId.trim() || undefined)}
        disabled={!groupId && !handlerId}
      />
    </FormShell>
  )
}

function AssignForm({
  companyId,
  onCancel,
  onSubmit,
}: {
  companyId: string
  onCancel: () => void
  onSubmit: (body: AssignBody) => void
}) {
  return (
    <GroupSelectForm
      title="手动分配"
      companyId={companyId}
      onCancel={onCancel}
      allowHandler
      onSubmit={(groupId, handlerId) => onSubmit({ groupId, handlerId })}
    />
  )
}

function TransferForm({
  companyId,
  onCancel,
  onSubmit,
}: {
  companyId: string
  onCancel: () => void
  onSubmit: (body: { toGroupId?: string; toHandlerId?: string }) => void
}) {
  return (
    <GroupSelectForm
      title="转派工单"
      companyId={companyId}
      onCancel={onCancel}
      allowHandler
      onSubmit={(groupId, handlerId) => onSubmit({ toGroupId: groupId, toHandlerId: handlerId })}
    />
  )
}

function ConfirmForm({
  message,
  danger,
  onCancel,
  onConfirm,
}: {
  message: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <FormShell title="确认操作" onCancel={onCancel}>
      <p className="text-sm text-slate-600">{message}</p>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">
          取消
        </button>
        <button
          onClick={onConfirm}
          className={`rounded-md px-3 py-1.5 text-xs font-medium text-white ${
            danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
          }`}
        >
          确认
        </button>
      </div>
    </FormShell>
  )
}

function EvaluationForm({
  submitterId,
  onCancel,
  onSubmit,
}: {
  submitterId: string
  onCancel: () => void
  onSubmit: (body: CreateEvaluationBody) => void
}) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  return (
    <FormShell title="满意度评价" onCancel={onCancel}>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} className="p-0.5">
            <svg
              className={`h-6 w-6 ${n <= rating ? 'text-amber-400' : 'text-slate-200 hover:text-amber-200'}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.446a1 1 0 00-.364 1.118l1.286 3.957c.3.921-.755 1.688-1.54 1.118l-3.367-2.446a1 1 0 00-1.176 0l-3.367 2.446c-.784.57-1.838-.197-1.539-1.118l1.285-3.957a1 1 0 00-.363-1.118L2.063 9.384c-.784-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.285-3.957z" />
            </svg>
          </button>
        ))}
        <span className="ml-2 text-xs text-slate-500">{RATING_LABEL[rating]}</span>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder="评价备注（可选）"
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
      />
      <SubmitRow
        onCancel={onCancel}
        onSubmit={() => onSubmit({ submitterId, rating, comment: comment.trim() || undefined })}
      />
    </FormShell>
  )
}

function FormShell({ title, onCancel, children }: { title: string; onCancel: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-700">{title}</h4>
        <button onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600">
          ✕
        </button>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function SubmitRow({
  onCancel,
  onSubmit,
  disabled,
}: {
  onCancel: () => void
  onSubmit: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button onClick={onCancel} className="rounded-md px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">
        取消
      </button>
      <button
        onClick={onSubmit}
        disabled={disabled}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
      >
        提交
      </button>
    </div>
  )
}

// ---- 辅助 ----
function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
