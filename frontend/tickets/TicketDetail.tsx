import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, CheckCircle2, UserPlus, X, XCircle } from 'lucide-react';
import type { TicketDetail as TicketDetailData } from '../api/types';
import { apiErrorMessage, cancelTicket, completeTicket, getTicket } from '../api/client';
import { useCurrentUser } from '../app/currentUser';
import { useToast } from '../app/toast';
import { formatDateTime } from '../app/format';
import { statusLabel } from '../app/labels';
import { PriorityTag, StatusBadge } from '../components/Badges';
import { CollapsibleText } from '../components/CollapsibleText';
import { ErrorBanner, Spinner } from '../components/common';
import { AssignPanel } from './AssignPanel';
import { RatingPanel } from './RatingPanel';
import { ReplyBox } from './ReplyBox';
import { ReplyTimeline, EventTimeline } from './Timeline';
import { SubmitterPanel } from './SubmitterPanel';

type ActivePanel = 'none' | 'assign' | 'reassign' | 'complete' | 'cancel';

interface TicketDetailProps {
  ticketId: number;
  /** 工单数据变化后通知列表刷新。 */
  onChanged: () => void;
  /** 从历史工单等入口切换查看其他工单。 */
  onOpenTicket: (ticketId: number) => void;
  /** 关闭详情（取消选中）。 */
  onClose: () => void;
}

/**
 * 工单详情面板（split-master-detail 的 detail 侧）。
 * 读回全部字段（AC-01）、回复时间线（AC-02）、状态流转操作（AC-03）、
 * 分配（AC-05）、转派（AC-06）、提交人信息与历史工单（AC-07）、
 * 完成与处理记录（AC-08）、满意度评价（AC-09）。
 */
export function TicketDetail({ ticketId, onChanged, onOpenTicket, onClose }: TicketDetailProps) {
  const { currentUser } = useCurrentUser();
  const { pushToast } = useToast();
  const [detail, setDetail] = useState<TicketDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [activePanel, setActivePanel] = useState<ActivePanel>('none');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTicket(ticketId)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setActivePanel('none');
        setActionError(null);
        setNote('');
        setReason('');
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId, reloadTick]);

  const reload = useCallback(() => setReloadTick((n) => n + 1), []);

  const handleTicketUpdate = useCallback(
    (updated: TicketDetailData) => {
      setDetail(updated);
      onChanged();
    },
    [onChanged],
  );

  const runAction = useCallback(
    async (action: () => Promise<TicketDetailData>, successMessage: string) => {
      setActionBusy(true);
      setActionError(null);
      try {
        const updated = await action();
        setDetail(updated);
        onChanged();
        pushToast('success', successMessage);
        setActivePanel('none');
        setNote('');
        setReason('');
      } catch (err) {
        setActionError(apiErrorMessage(err));
      } finally {
        setActionBusy(false);
      }
    },
    [onChanged, pushToast],
  );

  const permissions = useMemo(() => {
    if (detail === null || currentUser === null) return null;
    const isSubmitter = detail.submitter.id === currentUser.id;
    const isAssignee = detail.assignee !== null && detail.assignee.id === currentUser.id;
    const isAdminOfSubmitterCompany =
      currentUser.isCompanyAdmin && currentUser.company.id === detail.submitter.company.id;
    const inSubmitterCompany = currentUser.company.id === detail.submitter.company.id;
    const terminal = detail.status === 'completed' || detail.status === 'cancelled';
    return {
      // 入口按状态与同公司显示；「该公司任意业务组成员」的精确资格在分配面板内判定，
      // 全部业务合法性以服务端响应为准（前端仅做展示层隐藏/提示）。
      canAssign:
        (detail.status === 'created' || detail.status === 'pending_assignment') &&
        (isAdminOfSubmitterCompany || inSubmitterCompany),
      canReassign: detail.status === 'processing' && (isAssignee || isAdminOfSubmitterCompany),
      canComplete: detail.status === 'processing' && (isAssignee || isAdminOfSubmitterCompany),
      canCancel: !terminal && (isSubmitter || isAssignee),
      canReply: isSubmitter || isAssignee,
    };
  }, [detail, currentUser]);

  const submitComplete = () => {
    if (detail === null) return;
    const trimmed = note.trim();
    void runAction(
      () => completeTicket(detail.id, trimmed.length > 0 ? { note: trimmed } : undefined),
      `工单 ${detail.ticketNo} 已完成处理`,
    );
  };

  const submitCancel = () => {
    if (detail === null) return;
    const trimmed = reason.trim();
    void runAction(
      () => cancelTicket(detail.id, trimmed.length > 0 ? { reason: trimmed } : undefined),
      `工单 ${detail.ticketNo} 已取消`,
    );
  };

  return (
    <div className="detail-panel">
      {loading && detail === null && (
        <div className="panel-center">
          <Spinner label="正在加载工单详情…" />
        </div>
      )}
      {error !== null && (
        <div className="panel-pad">
          <ErrorBanner message={`工单详情加载失败：${error}`} onRetry={reload} />
        </div>
      )}
      {detail !== null && (
        <div className="detail-scroll">
          <header className="detail-header">
            <div className="detail-title-row">
              <span className="mono ticket-no">{detail.ticketNo}</span>
              <StatusBadge status={detail.status} />
              <PriorityTag priority={detail.priority} />
              <span className="chip chip-category" title={detail.category.name}>
                {detail.category.name}
              </span>
            </div>
            <h2 className="detail-subject" title={detail.subject}>
              {detail.subject}
            </h2>
            <dl className="detail-meta">
              <div>
                <dt>提交人</dt>
                <dd>{detail.submitter.name}</dd>
              </div>
              <div>
                <dt>所属公司</dt>
                <dd>{detail.submitter.company.name}</dd>
              </div>
              <div>
                <dt>业务组</dt>
                <dd>
                  {detail.assignedGroup !== null ? (
                    detail.assignedGroup.name
                  ) : (
                    <span className="muted">未指派</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>当前处理人</dt>
                <dd>
                  {detail.assignee !== null ? detail.assignee.name : <span className="muted">未指派</span>}
                </dd>
              </div>
              <div>
                <dt>创建时间</dt>
                <dd title={detail.createdAt}>{formatDateTime(detail.createdAt)}</dd>
              </div>
              <div>
                <dt>最近更新</dt>
                <dd title={detail.updatedAt}>{formatDateTime(detail.updatedAt)}</dd>
              </div>
              {detail.completedAt !== null && (
                <div>
                  <dt>完成时间</dt>
                  <dd title={detail.completedAt}>{formatDateTime(detail.completedAt)}</dd>
                </div>
              )}
              {detail.completedBy !== null && (
                <div>
                  <dt>完成处理人</dt>
                  <dd>{detail.completedBy.name}</dd>
                </div>
              )}
            </dl>
          </header>

          <section className="detail-section">
            <h3 className="section-title">描述</h3>
            <CollapsibleText text={detail.description.length > 0 ? detail.description : '（无描述）'} />
          </section>

          <section className="detail-section">
            <h3 className="section-title">操作</h3>
            {permissions !== null &&
            (permissions.canAssign || permissions.canReassign || permissions.canComplete || permissions.canCancel) ? (
              <div className="action-bar">
                {permissions.canAssign && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setActivePanel(activePanel === 'assign' ? 'none' : 'assign')}
                    disabled={actionBusy}
                  >
                    <UserPlus size={14} /> 分配业务组…
                  </button>
                )}
                {permissions.canReassign && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setActivePanel(activePanel === 'reassign' ? 'none' : 'reassign')}
                    disabled={actionBusy}
                  >
                    <ArrowRightLeft size={14} /> 转派…
                  </button>
                )}
                {permissions.canComplete && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setActivePanel(activePanel === 'complete' ? 'none' : 'complete')}
                    disabled={actionBusy}
                  >
                    <CheckCircle2 size={14} /> 完成处理…
                  </button>
                )}
                {permissions.canCancel && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => setActivePanel(activePanel === 'cancel' ? 'none' : 'cancel')}
                    disabled={actionBusy}
                  >
                    <XCircle size={14} /> 取消工单…
                  </button>
                )}
              </div>
            ) : (
              <p className="muted small">当前状态（{statusLabel(detail.status)}）下暂无可执行操作。</p>
            )}
            {detail.status === 'created' && (
              <p className="muted small">
                分配说明：点击「分配业务组」后工单将进入「待分配」，指派业务组与处理人后转为「待处理」。
              </p>
            )}
            {actionError !== null && (
              <div className="form-error" role="alert">
                {actionError}
              </div>
            )}

            {activePanel === 'assign' && (
              <AssignPanel
                mode="assign"
                ticket={detail}
                onTicketUpdate={handleTicketUpdate}
                onClose={() => setActivePanel('none')}
              />
            )}
            {activePanel === 'reassign' && (
              <AssignPanel
                mode="reassign"
                ticket={detail}
                onTicketUpdate={handleTicketUpdate}
                onClose={() => setActivePanel('none')}
              />
            )}
            {activePanel === 'complete' && (
              <div className="action-panel">
                <h4 className="action-panel-title">完成处理</h4>
                <p className="action-hint">
                  确认完成该工单的处理？系统将记录处理人与处理时间（当前操作者）。
                </p>
                <label className="form-field">
                  <span className="form-label">处理备注（可选）</span>
                  <textarea
                    className="textarea"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="可填写处理说明，将记录在完成事件中"
                    disabled={actionBusy}
                  />
                </label>
                <div className="panel-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={submitComplete}
                    disabled={actionBusy}
                  >
                    <CheckCircle2 size={14} /> {actionBusy ? '提交中…' : '确认完成'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setActivePanel('none')}
                    disabled={actionBusy}
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
            {activePanel === 'cancel' && (
              <div className="action-panel">
                <h4 className="action-panel-title">取消工单</h4>
                <p className="action-hint">取消后工单进入终态，不再进入处理流程。</p>
                <label className="form-field">
                  <span className="form-label">取消原因（可选）</span>
                  <textarea
                    className="textarea"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="可填写取消原因"
                    disabled={actionBusy}
                  />
                </label>
                <div className="panel-actions">
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={submitCancel}
                    disabled={actionBusy}
                  >
                    <XCircle size={14} /> {actionBusy ? '提交中…' : '确认取消'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setActivePanel('none')}
                    disabled={actionBusy}
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="detail-section">
            <h3 className="section-title">回复（{detail.replies.length}）</h3>
            <ReplyTimeline replies={detail.replies} />
            {permissions?.canReply ?? false ? (
              <ReplyBox
                detail={detail}
                onReplied={(updated) => {
                  setDetail(updated);
                  onChanged();
                }}
              />
            ) : (
              <p className="muted small">仅工单提交人与当前处理人可回复。</p>
            )}
          </section>

          <section className="detail-section">
            <h3 className="section-title">处理记录（{detail.events.length}）</h3>
            <EventTimeline events={detail.events} />
          </section>

          <section className="detail-section">
            <h3 className="section-title">提交人信息</h3>
            <SubmitterPanel
              submitter={detail.submitter}
              currentTicketId={detail.id}
              onOpenTicket={onOpenTicket}
            />
          </section>

          <section className="detail-section">
            <h3 className="section-title">满意度评价</h3>
            <RatingPanel
              detail={detail}
              onRated={() => {
                reload();
                onChanged();
              }}
            />
          </section>
        </div>
      )}
      {detail !== null && (
        <button type="button" className="icon-btn detail-close" onClick={onClose} aria-label="关闭详情">
          <X size={15} />
        </button>
      )}
    </div>
  );
}
