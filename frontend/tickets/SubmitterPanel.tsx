import { useEffect, useState } from 'react';
import { apiErrorMessage, listUserTickets } from '../api/client';
import type { Ticket, User } from '../api/types';
import { ErrorBanner, Spinner } from '../components/common';
import { PriorityTag, StatusBadge } from '../components/Badges';
import { formatDateTime } from '../app/format';

interface SubmitterPanelProps {
  submitter: User;
  currentTicketId: number;
  onOpenTicket: (ticketId: number) => void;
}

/** 提交人完整信息（姓名/公司/部门）与历史工单（AC-07）。 */
export function SubmitterPanel({ submitter, currentTicketId, onOpenTicket }: SubmitterPanelProps) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setTickets(null);
    listUserTickets(submitter.id)
      .then((list) => {
        if (!cancelled) setTickets(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [submitter.id, reloadTick]);

  return (
    <div className="submitter-panel">
      <dl className="submitter-meta">
        <div>
          <dt>姓名</dt>
          <dd>{submitter.name}</dd>
        </div>
        <div>
          <dt>邮箱</dt>
          <dd>{submitter.email}</dd>
        </div>
        <div>
          <dt>公司</dt>
          <dd>{submitter.company.name}</dd>
        </div>
        <div>
          <dt>部门</dt>
          <dd>{submitter.department.length > 0 ? submitter.department : '—'}</dd>
        </div>
      </dl>
      <div className="submitter-history">
        <div className="submitter-history-head">
          <span className="section-subtitle">该提交人的历史工单（{tickets?.length ?? 0}）</span>
        </div>
        {error !== null && (
          <ErrorBanner
            message={`历史工单加载失败：${error}`}
            onRetry={() => setReloadTick((n) => n + 1)}
          />
        )}
        {tickets === null && error === null && <Spinner label="正在加载历史工单…" />}
        {tickets !== null && tickets.length === 0 && (
          <p className="muted small">该提交人暂无历史工单。</p>
        )}
        {tickets !== null && tickets.length > 0 && (
          <ul className="history-list">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  className={`history-row${ticket.id === currentTicketId ? ' current' : ''}`}
                  onClick={() => onOpenTicket(ticket.id)}
                  title={`${ticket.ticketNo} ${ticket.subject}`}
                >
                  <span className="mono ticket-no">{ticket.ticketNo}</span>
                  <span className="history-subject">{ticket.subject}</span>
                  <PriorityTag priority={ticket.priority} />
                  <StatusBadge status={ticket.status} />
                  <span className="time nowrap" title={ticket.createdAt}>
                    {formatDateTime(ticket.createdAt)}
                  </span>
                  {ticket.id === currentTicketId && <span className="current-tag">当前</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
