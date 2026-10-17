import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, UserPlus } from 'lucide-react';
import { ErrorBanner, Spinner } from '../components/common';
import {
  apiErrorMessage,
  assignTicket,
  dispatchTicket,
  isApiError,
  listBusinessGroups,
  reassignTicket,
} from '../api/client';
import type { AssignTicketBody, BusinessGroup, TicketDetail } from '../api/types';
import { useCurrentUser } from '../app/currentUser';
import { useToast } from '../app/toast';

interface AssignPanelProps {
  mode: 'assign' | 'reassign';
  ticket: TicketDetail;
  onTicketUpdate: (ticket: TicketDetail) => void;
  onClose: () => void;
}

/**
 * 分配 / 转派面板。
 * 分配模式：面板打开即调用 dispatch（created → pending_assignment，使「待分配」状态可观察），
 * 随后人工指派业务组与处理人（pending_assignment|created → processing）。
 * 转派模式：processing 状态内变更当前处理方。
 * 角色合法性由服务端校验；本面板仅在拿到业务组数据后做成员资格提示。
 */
export function AssignPanel({ mode, ticket, onTicketUpdate, onClose }: AssignPanelProps) {
  const { currentUser } = useCurrentUser();
  const { pushToast } = useToast();
  const [groups, setGroups] = useState<BusinessGroup[] | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsTick, setGroupsTick] = useState(0);
  const [groupId, setGroupId] = useState<number | ''>('');
  const [assigneeId, setAssigneeId] = useState<number | ''>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [dispatchNotice, setDispatchNotice] = useState<string | null>(null);
  const [dispatchWarning, setDispatchWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dispatchAttemptedRef = useRef<number | null>(null);
  const companyId = ticket.submitter.company.id;

  // 打开分配面板时：created 状态先进入分配流程（dispatch），使状态变化可观察（契约 3.6）。
  useEffect(() => {
    if (mode !== 'assign' || ticket.status !== 'created') return;
    if (dispatchAttemptedRef.current === ticket.id) return;
    dispatchAttemptedRef.current = ticket.id;
    dispatchTicket(ticket.id)
      .then((updated) => {
        onTicketUpdate(updated);
        setDispatchNotice('工单已进入分配流程（当前状态：待分配）');
      })
      .catch((err: unknown) => {
        if (isApiError(err, 'INVALID_STATE')) return; // 已流转，忽略
        setDispatchWarning(`进入分配流程失败：${apiErrorMessage(err)}。仍可直接指派业务组。`);
      });
  }, [mode, ticket.id, ticket.status, onTicketUpdate]);

  // 加载提交人公司的业务组（GET 任意有效用户可读）。
  useEffect(() => {
    let cancelled = false;
    setGroupsLoading(true);
    setGroupsError(null);
    listBusinessGroups(companyId)
      .then((list) => {
        if (cancelled) return;
        setGroups(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setGroupsError(apiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setGroupsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, groupsTick]);

  const selectedGroup = useMemo(
    () => groups?.find((g) => g.id === groupId) ?? null,
    [groups, groupId],
  );

  // 角色预判：该公司管理员或该公司任意业务组成员（最终以服务端校验为准）。
  const allowed = useMemo(() => {
    if (currentUser === null || groups === null) return false;
    if (currentUser.isCompanyAdmin && currentUser.company.id === companyId) return true;
    return groups.some((g) => g.members.some((m) => m.id === currentUser.id));
  }, [currentUser, groups, companyId]);

  const submit = async () => {
    if (groupId === '') {
      setFormError('请选择业务组');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const body: AssignTicketBody =
        assigneeId === '' ? { groupId } : { groupId, assigneeId };
      const updated =
        mode === 'assign'
          ? await assignTicket(ticket.id, body)
          : await reassignTicket(ticket.id, body);
      const assigneeText =
        updated.assignee !== null ? updated.assignee.name : '组内待定成员';
      pushToast(
        'success',
        mode === 'assign'
          ? `工单 ${ticket.ticketNo} 已分配至 ${updated.assignedGroup !== null ? updated.assignedGroup.name : '业务组'}（处理人：${assigneeText}）`
          : `工单 ${ticket.ticketNo} 已转派至 ${updated.assignedGroup !== null ? updated.assignedGroup.name : '业务组'}（处理人：${assigneeText}）`,
      );
      onTicketUpdate(updated);
      onClose();
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="action-panel">
      <h4 className="action-panel-title">
        {mode === 'assign' ? '分配工单' : '转派工单'}
      </h4>
      {dispatchNotice !== null && <div className="notice notice-info">{dispatchNotice}</div>}
      {dispatchWarning !== null && <div className="notice notice-warn">{dispatchWarning}</div>}
      {groupsLoading && <Spinner label="正在加载业务组…" />}
      {groupsError !== null && (
        <ErrorBanner
          message={`业务组加载失败：${groupsError}`}
          onRetry={() => setGroupsTick((n) => n + 1)}
        />
      )}
      {groups !== null && groups.length === 0 && (
        <p className="muted small">
          该公司尚未创建业务组。请先在「公司管理」中添加业务组与成员，再进行分配。
        </p>
      )}
      {groups !== null && groups.length > 0 && !allowed && (
        <div className="form-error" role="alert">
          当前用户不是该公司管理员，也不是该公司任意业务组成员，无法执行
          {mode === 'assign' ? '分配' : '转派'}（以服务端校验为准）。
        </div>
      )}
      {groups !== null && groups.length > 0 && (
        <div className="form">
          <p className="muted small">
            工单：{ticket.ticketNo} · {ticket.subject}
            {mode === 'reassign' && ticket.assignedGroup !== null && ` · 当前业务组：${ticket.assignedGroup.name}`}
            {mode === 'reassign' && ticket.assignee !== null && ` · 当前处理人：${ticket.assignee.name}`}
          </p>
          <label className="form-field">
            <span className="form-label">目标业务组 *</span>
            <select
              className="select"
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value === '' ? '' : Number(e.target.value));
                setAssigneeId('');
              }}
              disabled={!allowed || busy}
            >
              <option value="">请选择业务组</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}（{g.members.length} 名成员）
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">处理人</span>
            <select
              className="select"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value === '' ? '' : Number(e.target.value))}
              disabled={!allowed || busy || selectedGroup === null}
            >
              <option value="">默认（组内第一位成员）</option>
              {selectedGroup?.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <span className="form-hint">
              不选择时默认指派组内第一位成员；空组时暂不指派处理人。
            </span>
          </label>
          {formError !== null && (
            <div className="form-error" role="alert">
              {formError}
            </div>
          )}
          <div className="panel-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void submit()}
              disabled={busy || !allowed}
            >
              {mode === 'assign' ? <UserPlus size={14} /> : <ArrowRightLeft size={14} />}
              {busy ? '提交中…' : mode === 'assign' ? '确认分配' : '确认转派'}
            </button>
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
