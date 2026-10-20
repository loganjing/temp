// 工单详情（detail）：完整字段、提交人信息面板（处理视角含历史工单）、回复时间线与操作区。
// 操作可用性按契约第 2/7/11 节在界面上先行判断；最终权限与状态由服务端裁决并如实反馈错误。

import { useEffect, useMemo, useState } from 'react'
import {
  assignTicket,
  cancelTicket,
  completeTicket,
  fetchSubmitterView,
  fetchTicket,
  listBusinessGroups,
  rateTicket,
  replyTicket,
  transferTicket,
} from '../api'
import { ApiRequestError, describeApiError } from '../platform/api-client'
import type { BusinessGroup, SubmitterView, TicketDetail } from '../contracts'
import { formatDateTime } from '../format'
import { useAuth } from '../state/auth'
import { useCompanyDirectory } from '../state/company-directory'
import { EmptyBlock, ErrorBlock, LoadingBlock, Notice, PriorityBadge, Stars, StatusBadge } from './ui'
import { IconSend } from './icons'

type ActionForm = 'assign' | 'transfer' | 'complete' | 'cancel' | 'rating' | null

interface TicketDetailPanelProps {
  ticketId: number
  onChanged: () => void
}

export default function TicketDetailPanel({ ticketId, onChanged }: TicketDetailPanelProps) {
  const { user } = useAuth()
  const { register } = useCompanyDirectory()
  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [submitterView, setSubmitterView] = useState<SubmitterView | null>(null)
  const [groups, setGroups] = useState<BusinessGroup[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [openForm, setOpenForm] = useState<ActionForm>(null)

  const reload = async () => {
    const data = await fetchTicket(ticketId)
    setDetail(data)
    return data
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      setDetail(null)
      setSubmitterView(null)
      setGroups(null)
      setNotice(null)
      setOpenForm(null)
      try {
        const data = await fetchTicket(ticketId)
        if (cancelled) return
        setDetail(data)
        register([{ id: data.company_id, name: data.company_name }])
        if (user.role !== 'submitter') {
          // 处理视角：提交人完整信息与历史工单（面板缺失不影响主详情）
          try {
            const view = await fetchSubmitterView(ticketId)
            if (!cancelled) setSubmitterView(view)
          } catch {
            // 忽略提交人面板加载失败
          }
        }
      } catch (cause) {
        if (cancelled) return
        setError(
          cause instanceof ApiRequestError && cause.code === 'NOT_FOUND'
            ? '工单不存在或无权访问该工单'
            : describeApiError(cause),
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [ticketId, register, user.role, user.id])

  // 处理侧（ops / 本公司 handler）：加载工单所属公司的业务组，用于分配/转派与处理人姓名解析
  const groupsCompanyId = detail && user.role !== 'submitter' ? detail.company_id : null
  useEffect(() => {
    if (groupsCompanyId == null) return
    let cancelled = false
    listBusinessGroups(groupsCompanyId)
      .then(({ items }) => {
        if (!cancelled) setGroups(items)
      })
      .catch(() => {
        if (!cancelled) setGroups([])
      })
    return () => {
      cancelled = true
    }
  }, [groupsCompanyId])

  // 成功提示自动消退
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  const ticket = detail
  const isOps = user.role === 'ops'
  const isSubmitter = ticket != null && ticket.submitter_user_id === user.id
  const canOperate = ticket != null && (isOps || (user.role === 'handler' && ticket.company_id === user.company_id))
  const nonTerminal = ticket != null && ['created', 'pending_assignment', 'in_progress'].includes(ticket.status)
  const canReply = ticket != null && nonTerminal && (canOperate || isSubmitter)
  const canAssign = ticket != null && ticket.status === 'pending_assignment' && canOperate
  const canTransfer = ticket != null && ticket.status === 'in_progress' && canOperate
  const canComplete = ticket != null && ticket.status === 'in_progress' && canOperate
  const canCancel = ticket != null && nonTerminal && (isOps || isSubmitter)
  const canRate = ticket != null && ticket.status === 'completed' && isSubmitter && !ticket.rating

  const assignedHandlerName = useMemo(() => {
    if (!ticket?.assigned_handler_id || !groups) return null
    return (
      groups.flatMap((group) => group.members).find((member) => member.user_id === ticket.assigned_handler_id)
        ?.display_name ?? null
    )
  }, [ticket, groups])

  const runAction = async (name: string, action: () => Promise<void>) => {
    setBusyAction(name)
    setNotice(null)
    try {
      await action()
      return true
    } catch (cause) {
      setNotice({ kind: 'error', text: describeApiError(cause) })
      return false
    } finally {
      setBusyAction(null)
    }
  }

  if (loading) {
    return (
      <section className="card w-full flex-1">
        <LoadingBlock label="加载工单详情…" />
      </section>
    )
  }
  if (error) {
    return (
      <section className="card w-full flex-1">
        <ErrorBlock message={error} />
      </section>
    )
  }
  if (!ticket) {
    return (
      <section className="card w-full flex-1">
        <EmptyBlock title="请从列表选择工单查看详情" />
      </section>
    )
  }

  return (
    <article className="flex w-full min-w-0 flex-1 flex-col gap-4">
      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-slate-500">{ticket.ticket_no}</span>
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
        </div>
        <h2 className="mt-1.5 break-words text-lg font-semibold leading-snug">{ticket.subject}</h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <Field label="问题分类" value={ticket.category} />
          <Field label="所属公司" value={ticket.company_name} />
          <Field label="创建时间" value={formatDateTime(ticket.created_at)} />
          <Field label="优先级" value={ticket.priority} />
          <Field label="提交人" value={ticket.submitter_name} />
          <Field label="提交人部门" value={ticket.submitter_department ?? '未填写'} />
          <Field label="提交人邮箱" value={ticket.submitter_email} />
          <Field label="当前业务组" value={ticket.assigned_group_name ?? '未分配'} />
          <Field
            label="当前处理人"
            value={
              assignedHandlerName ??
              (ticket.assigned_handler_id != null ? `成员 #${ticket.assigned_handler_id}` : '未指派')
            }
          />
          {ticket.handled_by_name != null && <Field label="完成处理人" value={ticket.handled_by_name} />}
          {ticket.handled_at != null && <Field label="处理时间" value={formatDateTime(ticket.handled_at)} />}
          {ticket.completed_at != null && <Field label="完成时间" value={formatDateTime(ticket.completed_at)} />}
          {ticket.cancelled_at != null && <Field label="取消时间" value={formatDateTime(ticket.cancelled_at)} />}
          {ticket.cancel_reason != null && <Field label="取消原因" value={ticket.cancel_reason} />}
        </dl>
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h3 className="mb-1.5 text-xs font-semibold text-slate-500">问题描述</h3>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{ticket.description}</p>
        </div>
      </section>

      {notice && <Notice kind={notice.kind} text={notice.text} />}

      {(canAssign || canTransfer || canComplete || canCancel || canRate) && (
        <section className="card p-4">
          <h3 className="mb-3 text-sm font-semibold">操作</h3>
          <div className="flex flex-wrap gap-2">
            {canAssign && (
              <ActionToggle active={openForm === 'assign'} onClick={() => setOpenForm(openForm === 'assign' ? null : 'assign')}>
                分配
              </ActionToggle>
            )}
            {canTransfer && (
              <ActionToggle active={openForm === 'transfer'} onClick={() => setOpenForm(openForm === 'transfer' ? null : 'transfer')}>
                转派
              </ActionToggle>
            )}
            {canComplete && (
              <ActionToggle active={openForm === 'complete'} onClick={() => setOpenForm(openForm === 'complete' ? null : 'complete')}>
                完成处理
              </ActionToggle>
            )}
            {canCancel && (
              <ActionToggle danger active={openForm === 'cancel'} onClick={() => setOpenForm(openForm === 'cancel' ? null : 'cancel')}>
                取消工单
              </ActionToggle>
            )}
            {canRate && (
              <ActionToggle active={openForm === 'rating'} onClick={() => setOpenForm(openForm === 'rating' ? null : 'rating')}>
                满意度评价
              </ActionToggle>
            )}
          </div>
          {openForm === 'assign' && (
            <AssignForm
              groups={groups}
              busy={busyAction === 'assign'}
              onSubmit={(group_id, handler_id) =>
                runAction('assign', async () => {
                  const updated = await assignTicket(ticketId, { group_id, handler_id: handler_id ?? undefined })
                  setDetail(updated)
                  setNotice({ kind: 'success', text: '已分配业务组，工单进入待处理' })
                  setOpenForm(null)
                  onChanged()
                })
              }
            />
          )}
          {openForm === 'transfer' && (
            <TransferForm
              groups={groups}
              busy={busyAction === 'transfer'}
              onSubmit={(to_group_id, to_handler_id, reason) =>
                runAction('transfer', async () => {
                  const updated = await transferTicket(ticketId, {
                    to_group_id,
                    to_handler_id: to_handler_id ?? undefined,
                    reason: reason.trim() || undefined,
                  })
                  setDetail(updated)
                  setNotice({ kind: 'success', text: '已转派，工单保持待处理状态' })
                  setOpenForm(null)
                  onChanged()
                })
              }
            />
          )}
          {openForm === 'complete' && (
            <CompleteForm
              busy={busyAction === 'complete'}
              onSubmit={(resolution) =>
                runAction('complete', async () => {
                  const updated = await completeTicket(ticketId, { resolution: resolution.trim() || undefined })
                  setDetail(updated)
                  setNotice({ kind: 'success', text: '工单已完成，处理人与处理时间已记录' })
                  setOpenForm(null)
                  onChanged()
                })
              }
            />
          )}
          {openForm === 'cancel' && (
            <CancelForm
              busy={busyAction === 'cancel'}
              onSubmit={(reason) =>
                runAction('cancel', async () => {
                  const updated = await cancelTicket(ticketId, { reason: reason.trim() || undefined })
                  setDetail(updated)
                  setNotice({ kind: 'success', text: '工单已取消' })
                  setOpenForm(null)
                  onChanged()
                })
              }
            />
          )}
          {openForm === 'rating' && (
            <RatingForm
              busy={busyAction === 'rating'}
              onSubmit={(score, comment) =>
                runAction('rating', async () => {
                  const rating = await rateTicket(ticketId, { score, comment: comment.trim() || undefined })
                  setDetail({ ...ticket, rating: { score: rating.score, comment: rating.comment, created_at: rating.created_at } })
                  setNotice({ kind: 'success', text: '满意度评价已提交，感谢反馈' })
                  setOpenForm(null)
                })
              }
            />
          )}
        </section>
      )}

      {ticket.rating && (
        <section className="card p-4">
          <h3 className="mb-2.5 text-sm font-semibold">满意度评价</h3>
          <Stars value={ticket.rating.score} />
          {ticket.rating.comment && (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{ticket.rating.comment}</p>
          )}
          <p className="mt-2 text-xs text-slate-400">评价时间 {formatDateTime(ticket.rating.created_at)}</p>
        </section>
      )}

      {submitterView && (
        <section className="card p-4">
          <h3 className="mb-3 text-sm font-semibold">提交人信息</h3>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
            <Field label="姓名" value={submitterView.display_name} />
            <Field label="公司" value={submitterView.company.name} />
            <Field label="部门" value={submitterView.department ?? '未填写'} />
            <Field label="邮箱" value={submitterView.email} />
          </dl>
          <h4 className="mt-4 mb-2 text-xs font-semibold text-slate-500">
            历史工单（{submitterView.history.length}）
          </h4>
          {submitterView.history.length === 0 ? (
            <p className="text-xs text-slate-400">该提交人暂无历史工单</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="table-th">工单号</th>
                    <th className="table-th">主题</th>
                    <th className="table-th">状态</th>
                    <th className="table-th">优先级</th>
                    <th className="table-th">创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {submitterView.history.map((item) => (
                    <tr key={item.ticket_no}>
                      <td className="table-td font-mono text-xs text-slate-500">{item.ticket_no}</td>
                      <td className="table-td max-w-[200px]">
                        <span className="block truncate" title={item.subject}>
                          {item.subject}
                        </span>
                      </td>
                      <td className="table-td">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="table-td">
                        <PriorityBadge priority={item.priority} />
                      </td>
                      <td className="table-td whitespace-nowrap text-xs text-slate-500">{formatDateTime(item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <ReplyTimeline
        ticket={ticket}
        canReply={canReply}
        busy={busyAction === 'reply'}
        onSubmit={(content) =>
          runAction('reply', async () => {
            await replyTicket(ticketId, { content: content.trim() })
            await reload()
            setNotice({ kind: 'success', text: '回复已提交' })
          })
        }
      />
    </article>
  )
}

function Field({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-800" title={title ?? value}>
        {value}
      </dd>
    </div>
  )
}

function ActionToggle({
  active,
  danger,
  onClick,
  children,
}: {
  active: boolean
  danger?: boolean
  onClick: () => void
  children: string
}) {
  const base = danger ? 'btn btn-danger' : 'btn btn-secondary'
  return (
    <button type="button" className={`${base} ${active ? 'border-indigo-500 text-indigo-700' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}

function GroupSelectForAction({
  groups,
  groupId,
  setGroupId,
  handlerId,
  setHandlerId,
}: {
  groups: BusinessGroup[] | null
  groupId: string
  setGroupId: (value: string) => void
  handlerId: string
  setHandlerId: (value: string) => void
}) {
  const selectedGroup = groups?.find((group) => String(group.id) === groupId)
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="label">目标业务组</label>
        <select
          className="input"
          value={groupId}
          onChange={(event) => {
            setGroupId(event.currentTarget.value)
            setHandlerId('')
          }}
        >
          <option value="">请选择业务组</option>
          {groups?.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">处理人（可选）</label>
        <select
          className="input"
          value={handlerId}
          disabled={!selectedGroup || selectedGroup.members.length === 0}
          onChange={(event) => setHandlerId(event.currentTarget.value)}
        >
          <option value="">不指定（组内处理）</option>
          {selectedGroup?.members.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.display_name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function AssignForm({
  groups,
  busy,
  onSubmit,
}: {
  groups: BusinessGroup[] | null
  busy: boolean
  onSubmit: (groupId: number, handlerId: number | null) => void
}) {
  const [groupId, setGroupId] = useState('')
  const [handlerId, setHandlerId] = useState('')
  const [error, setError] = useState('')
  const submit = () => {
    if (!groupId) {
      setError('请选择要分配的业务组')
      return
    }
    setError('')
    onSubmit(Number(groupId), handlerId ? Number(handlerId) : null)
  }
  return (
    <div className="mt-4 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <GroupSelectForAction
        groups={groups}
        groupId={groupId}
        setGroupId={(value) => {
          setGroupId(value)
          setHandlerId('')
        }}
        handlerId={handlerId}
        setHandlerId={setHandlerId}
      />
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || groups == null}>
          {busy ? '提交中…' : '确认分配'}
        </button>
      </div>
    </div>
  )
}

function TransferForm({
  groups,
  busy,
  onSubmit,
}: {
  groups: BusinessGroup[] | null
  busy: boolean
  onSubmit: (toGroupId: number, toHandlerId: number | null, reason: string) => void
}) {
  const [groupId, setGroupId] = useState('')
  const [handlerId, setHandlerId] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const submit = () => {
    if (!groupId) {
      setError('请选择要转派到的业务组')
      return
    }
    setError('')
    onSubmit(Number(groupId), handlerId ? Number(handlerId) : null, reason)
  }
  return (
    <div className="mt-4 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <GroupSelectForAction
        groups={groups}
        groupId={groupId}
        setGroupId={(value) => {
          setGroupId(value)
          setHandlerId('')
        }}
        handlerId={handlerId}
        setHandlerId={setHandlerId}
      />
      <div>
        <label className="label">转派原因（可选）</label>
        <textarea
          className="textarea min-h-[64px]"
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          maxLength={500}
          placeholder="说明转派原因，便于追溯"
        />
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || groups == null}>
          {busy ? '提交中…' : '确认转派'}
        </button>
      </div>
    </div>
  )
}

function CompleteForm({ busy, onSubmit }: { busy: boolean; onSubmit: (resolution: string) => void }) {
  const [resolution, setResolution] = useState('')
  return (
    <div className="mt-4 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div>
        <label className="label">处理说明（可选，将作为一条回复）</label>
        <textarea
          className="textarea min-h-[80px]"
          value={resolution}
          onChange={(event) => setResolution(event.currentTarget.value)}
          maxLength={2000}
          placeholder="记录处理结果，便于提交人了解处理过程"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">完成后将记录处理人与处理时间，并通知提交人。</p>
        <button type="button" className="btn btn-primary" onClick={() => onSubmit(resolution)} disabled={busy}>
          {busy ? '提交中…' : '确认完成'}
        </button>
      </div>
    </div>
  )
}

function CancelForm({ busy, onSubmit }: { busy: boolean; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return (
    <div className="mt-4 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div>
        <label className="label">取消原因（可选）</label>
        <textarea
          className="textarea min-h-[64px]"
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          maxLength={500}
          placeholder="说明取消原因"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">取消后工单进入终态，不可再恢复处理。</p>
        <button type="button" className="btn btn-danger" onClick={() => onSubmit(reason)} disabled={busy}>
          {busy ? '提交中…' : '确认取消'}
        </button>
      </div>
    </div>
  )
}

function RatingForm({ busy, onSubmit }: { busy: boolean; onSubmit: (score: number, comment: string) => void }) {
  const [score, setScore] = useState(0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const submit = () => {
    if (score < 1) {
      setError('请先选择 1–5 分评分')
      return
    }
    setError('')
    onSubmit(score, comment)
  }
  return (
    <div className="mt-4 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div>
        <span className="label">满意度评分（1–5 分）</span>
        <Stars value={score} onChange={setScore} />
      </div>
      <div>
        <label className="label" htmlFor="rating-comment">
          评价留言（可选）
        </label>
        <textarea
          id="rating-comment"
          className="textarea min-h-[64px]"
          value={comment}
          onChange={(event) => setComment(event.currentTarget.value)}
          maxLength={1000}
          placeholder="补充说明您的评价"
        />
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">每张工单仅可评价一次。</p>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? '提交中…' : '提交评价'}
        </button>
      </div>
    </div>
  )
}

function ReplyTimeline({
  ticket,
  canReply,
  busy,
  onSubmit,
}: {
  ticket: TicketDetail
  canReply: boolean
  busy: boolean
  onSubmit: (content: string) => Promise<boolean>
}) {
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const submit = async () => {
    if (!content.trim()) {
      setError('请填写回复内容')
      return
    }
    setError('')
    // 提交成功后再清空输入；失败时保留内容便于修正重试
    if (await onSubmit(content)) setContent('')
  }
  return (
    <section className="card p-4">
      <h3 className="mb-3 text-sm font-semibold">沟通记录（{ticket.replies.length}）</h3>
      {ticket.replies.length === 0 ? (
        <p className="text-xs text-slate-400">暂无回复</p>
      ) : (
        <ol className="space-y-4">
          {ticket.replies.map((reply) => (
            <li key={reply.id} className="border-l-2 border-slate-200 pl-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{reply.author_name}</span>
                <span>{formatDateTime(reply.created_at)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{reply.content}</p>
            </li>
          ))}
        </ol>
      )}
      {canReply && (
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
          <label className="label" htmlFor="reply-content">
            回复
          </label>
          <textarea
            id="reply-content"
            className="textarea min-h-[72px]"
            value={content}
            onChange={(event) => setContent(event.currentTarget.value)}
            maxLength={5000}
            placeholder="回复提交人或处理人，支持多轮沟通"
          />
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex justify-end">
            <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
              <IconSend size={14} />
              {busy ? '提交中…' : '提交回复'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
