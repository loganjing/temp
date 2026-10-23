/**
 * Ticket detail panel — shown in the right side of the split layout.
 * Includes:
 * - Ticket header (title, status, priority, meta)
 * - Submitter info panel (name, company, department, history tickets)
 * - Multi-round reply chain (chronological)
 * - Action area: reply, transfer, complete, cancel
 * - Satisfaction evaluation (for completed tickets by submitter)
 * - Operation log timeline
 */

import { useCallback, useState } from 'react';
import { api, ApiError } from '../api';
import { useAsync } from '../hooks';
import { useAuth } from '../auth';
import type { TicketDetail as TicketDetailType, SubmitterInfo, TicketLog } from '../types';
import { StatusBadge, PriorityBadge, Skeleton, EmptyState, ErrorState, RatingStars } from '../components/ui';

const actionLabels: Record<string, string> = {
  created: '创建工单',
  assigned: '分配工单',
  transferred: '转派工单',
  completed: '完成工单',
  cancelled: '取消工单',
  evaluated: '评价工单',
};

export function TicketDetailPanel({ ticketId }: { ticketId: number }) {
  const { user, hasRole } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = () => setRefreshKey((k) => k + 1);

  const loadDetail = useCallback(() => api.getTicket(ticketId), [ticketId, refreshKey]);
  const { data: ticket, loading, error, retry } = useAsync(loadDetail, [ticketId, refreshKey]);

  // Submitter info — only for handlers/admins
  const loadSubmitterInfo = useCallback(
    () => api.getSubmitterInfo(ticketId),
    [ticketId, refreshKey],
  );
  const canViewSubmitter = hasRole('handler') || hasRole('admin');
  const { data: submitterInfo } = useAsync(
    canViewSubmitter ? loadSubmitterInfo : () => Promise.resolve(null),
    [ticketId, refreshKey],
  );

  // Operation logs
  const loadLogs = useCallback(
    () => api.getTicketLogs(ticketId).then((r) => r.items),
    [ticketId, refreshKey],
  );
  const { data: logs } = useAsync(loadLogs, [ticketId, refreshKey]);

  if (loading) {
    return (
      <div style={{ padding: '20px' }}>
        <Skeleton lines={4} />
        <div style={{ marginTop: 16 }}><Skeleton lines={3} /></div>
      </div>
    );
  }
  if (error) {
    return (
      <ErrorState
        message={error instanceof ApiError ? error.message : '加载工单详情失败'}
        onRetry={retry}
      />
    );
  }
  if (!ticket) return <EmptyState />;

  return (
    <div>
      <TicketHeader ticket={ticket} />
      <SubmitterPanel info={submitterInfo} />
      <ReplyChain ticket={ticket} onRefresh={triggerRefresh} />
      <ActionArea ticket={ticket} user={user} onRefresh={triggerRefresh} />
      <EvaluationArea ticket={ticket} userId={user?.id} onRefresh={triggerRefresh} />
      <LogTimeline logs={logs ?? []} />
    </div>
  );
}

// ── Ticket Header ───────────────────────────────────────────────────────────

function TicketHeader({ ticket }: { ticket: TicketDetailType }) {
  return (
    <div className="detail-header">
      <div className="flex items-center justify-between mb-8">
        <h2>{ticket.title}</h2>
        <div className="flex gap-8 items-center">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.slaPriority} />
        </div>
      </div>
      <div className="detail-grid">
        <dt>工单编号</dt><dd>#{ticket.id}</dd>
        <dt>分类</dt><dd>{ticket.categoryName}</dd>
        <dt>提交人</dt><dd>{ticket.submitterName}</dd>
        {ticket.companyName && <><dt>公司</dt><dd>{ticket.companyName}</dd></>}
        {ticket.businessGroupName && <><dt>业务组</dt><dd>{ticket.businessGroupName}</dd></>}
        <dt>处理人</dt><dd>{ticket.handlerName ?? '未分配'}</dd>
        <dt>创建时间</dt><dd>{new Date(ticket.createdAt).toLocaleString('zh-CN')}</dd>
        {ticket.completedAt && <><dt>完成时间</dt><dd>{new Date(ticket.completedAt).toLocaleString('zh-CN')}</dd></>}
      </div>
      <div className="mt-16">
        <div className="text-sm text-secondary mb-8">问题描述</div>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>{ticket.description}</div>
      </div>
    </div>
  );
}

// ── Submitter Info Panel ────────────────────────────────────────────────────

function SubmitterPanel({ info }: { info: SubmitterInfo | null }) {
  if (!info) return null;
  return (
    <div className="detail-section">
      <h3>提交人信息</h3>
      <div className="detail-grid mb-8">
        <dt>姓名</dt><dd>{info.name}</dd>
        <dt>邮箱</dt><dd>{info.email}</dd>
        <dt>公司</dt><dd>{info.companyName}</dd>
        <dt>部门</dt><dd>{info.departmentName}</dd>
      </div>
      <div className="text-sm text-secondary mb-8">历史工单</div>
      {info.historyTickets.length === 0 ? (
        <div className="text-sm text-secondary">暂无历史工单</div>
      ) : (
        <div className="table" style={{ fontSize: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>编号</th><th>主题</th><th>状态</th><th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              {info.historyTickets.map((t) => (
                <tr key={t.id}>
                  <td>#{t.id}</td>
                  <td>{t.title}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>{new Date(t.createdAt).toLocaleString('zh-CN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Reply Chain ─────────────────────────────────────────────────────────────

function ReplyChain({ ticket, onRefresh }: { ticket: TicketDetailType; onRefresh: () => void }) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReply = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createReply(ticket.id, { content: content.trim() });
      setContent('');
      onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '回复失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="detail-section">
      <h3>回复链（{ticket.replies?.length ?? 0}）</h3>
      <div className="reply-list mb-16">
        {ticket.replies && ticket.replies.length > 0 ? (
          ticket.replies.map((r) => (
            <div key={r.id} className="reply-item">
              <div className="reply-header">
                <span className="reply-author">{r.replierName}</span>
                <span className="reply-time">
                  {new Date(r.createdAt).toLocaleString('zh-CN')}
                </span>
              </div>
              <div className="reply-content">{r.content}</div>
            </div>
          ))
        ) : (
          <div className="text-sm text-secondary">暂无回复</div>
        )}
      </div>
      <div className="form-group">
        <textarea
          className="form-textarea"
          style={{ minHeight: 72 }}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="输入回复内容…"
        />
      </div>
      {error && <div className="form-error mb-8">{error}</div>}
      <button
        className="btn btn-primary btn-sm"
        onClick={handleReply}
        disabled={submitting || !content.trim()}
      >
        {submitting ? '发送中…' : '发送回复'}
      </button>
    </div>
  );
}

// ── Action Area: transfer, complete, cancel ─────────────────────────────────

function ActionArea({
  ticket,
  user,
  onRefresh,
}: {
  ticket: TicketDetailType;
  user: { id: number; roles: string[] } | null;
  onRefresh: () => void;
}) {
  const { hasRole } = useAuth();
  const [transferTarget, setTransferTarget] = useState('');
  const [transferOpen, setTransferOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load business group members for transfer dropdown
  const [groupMembers, setGroupMembers] = useState<
    { userId: number; userName: string }[]
  >([]);

  const loadTransferTargets = async () => {
    try {
      const res = await api.listBusinessGroups();
      const members: { userId: number; userName: string }[] = [];
      for (const g of res.items) {
        if (ticket.businessGroupId && g.id !== ticket.businessGroupId) {
          // include same-company group members
        }
        for (const m of g.members) {
          if (m.userId !== user?.id && !members.find((x) => x.userId === m.userId)) {
            members.push({ userId: m.userId, userName: m.userName });
          }
        }
      }
      setGroupMembers(members);
    } catch {
      // ignore — dropdown will be empty
    }
  };

  const handleTransfer = async () => {
    if (!transferTarget) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.transferTicket(ticket.id, {
        targetUserId: Number(transferTarget),
      });
      setTransferOpen(false);
      setTransferTarget('');
      onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '转派失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplete = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.completeTicket(ticket.id);
      onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '完成操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.cancelTicket(ticket.id);
      onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '取消操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const isHandler = hasRole('handler') || hasRole('admin');
  const isSubmitter = hasRole('submitter') || hasRole('admin');
  const canComplete = isHandler && ticket.status === 'pending_processing';
  const canTransfer = isHandler && ticket.status === 'pending_processing';
  const canCancel =
    (isSubmitter || hasRole('admin')) &&
    ticket.status !== 'completed' &&
    ticket.status !== 'cancelled';

  return (
    <div className="detail-section">
      <h3>工单操作</h3>
      {transferOpen && (
        <div className="form-group">
          <label className="form-label">转派给（同公司业务组成员）</label>
          <div className="flex gap-8">
            <select
              className="form-select"
              value={transferTarget}
              onChange={(e) => setTransferTarget(e.target.value)}
              onClick={loadTransferTargets}
            >
              <option value="">选择成员…</option>
              {groupMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.userName}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleTransfer}
              disabled={submitting || !transferTarget}
            >
              确认转派
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setTransferOpen(false)}
            >
              取消
            </button>
          </div>
        </div>
      )}
      <div className="flex gap-8">
        {canTransfer && !transferOpen && (
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setTransferOpen(true)}
          >
            转派
          </button>
        )}
        {canComplete && (
          <button
            className="btn btn-primary btn-sm"
            onClick={handleComplete}
            disabled={submitting}
          >
            完成处理
          </button>
        )}
        {canCancel && (
          <button
            className="btn btn-danger btn-sm"
            onClick={handleCancel}
            disabled={submitting}
          >
            取消工单
          </button>
        )}
        {!canComplete && !canTransfer && !canCancel && (
          <span className="text-sm text-secondary">当前状态无可执行操作</span>
        )}
      </div>
      {error && <div className="form-error mt-8">{error}</div>}
    </div>
  );
}

// ── Satisfaction Evaluation ─────────────────────────────────────────────────

function EvaluationArea({
  ticket,
  userId,
  onRefresh,
}: {
  ticket: TicketDetailType;
  userId?: number;
  onRefresh: () => void;
}) {
  const { hasRole } = useAuth();
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (ticket.status !== 'completed') return null;
  const isSubmitter = userId === ticket.submitterId;
  if (!isSubmitter && !hasRole('admin')) return null;

  const handleEvaluate = async () => {
    if (rating < 1) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createEvaluation(ticket.id, { rating });
      setRating(0);
      onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '评价失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (ticket.evaluation) {
    return (
      <div className="detail-section">
        <h3>满意度评价</h3>
        <div className="flex items-center gap-12">
          <RatingStars value={ticket.evaluation.rating} readonly />
          <span className="text-sm text-secondary">
            评价时间：{new Date(ticket.evaluation.createdAt).toLocaleString('zh-CN')}
          </span>
        </div>
      </div>
    );
  }

  if (!isSubmitter) return null;

  return (
    <div className="detail-section">
      <h3>满意度评价</h3>
      <div className="flex items-center gap-12">
        <RatingStars value={rating} onChange={setRating} />
        <button
          className="btn btn-primary btn-sm"
          onClick={handleEvaluate}
          disabled={submitting || rating < 1}
        >
          {submitting ? '提交中…' : '提交评价'}
        </button>
      </div>
      {error && <div className="form-error mt-8">{error}</div>}
    </div>
  );
}

// ── Operation Log Timeline ──────────────────────────────────────────────────

function LogTimeline({ logs }: { logs: TicketLog[] }) {
  return (
    <div className="detail-section">
      <h3>操作日志</h3>
      {logs.length === 0 ? (
        <div className="text-sm text-secondary">暂无操作日志</div>
      ) : (
        <div className="timeline">
          {logs.map((log) => (
            <div key={log.id} className="timeline-item">
              <div className="timeline-action">
                {actionLabels[log.action] ?? log.action} · {log.operatorName}
              </div>
              <div className="timeline-meta">
                {new Date(log.operatorTime).toLocaleString('zh-CN')}
              </div>
              {log.details && (
                <div className="timeline-details">{log.details}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
