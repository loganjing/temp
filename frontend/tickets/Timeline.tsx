import type { ReactNode } from 'react';
import type { Reply, TicketEvent } from '../api/types';
import { isAssignmentEventDetail, isCancelledEventDetail } from '../api/types';
import { eventLabel } from '../app/labels';
import { formatDateTime, formatDateTimeWithSeconds } from '../app/format';

/** 回复时间线：按回复时间升序展示（契约保证升序，前端再稳定排序一次）。 */
export function ReplyTimeline({ replies }: { replies: Reply[] }) {
  if (replies.length === 0) {
    return <p className="muted small">暂无回复。提交人与当前处理人可多轮回复沟通。</p>;
  }
  const sorted = [...replies].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <ul className="reply-list">
      {sorted.map((reply) => (
        <li key={reply.id} className="reply-item">
          <div className="reply-item-header">
            <span className="reply-author">{reply.author.name}</span>
            <span className="reply-time" title={reply.createdAt}>
              {formatDateTimeWithSeconds(reply.createdAt)}
            </span>
          </div>
          <p className="reply-content text-prewrap">{reply.content}</p>
        </li>
      ))}
    </ul>
  );
}

function describeEventDetail(event: TicketEvent): ReactNode {
  if (
    (event.type === 'assigned' || event.type === 'reassigned') &&
    isAssignmentEventDetail(event.detail)
  ) {
    const detail = event.detail;
    const parts: string[] = [`业务组：${detail.group.name}`];
    parts.push(`处理人：${detail.assignee !== null ? detail.assignee.name : '待定'}`);
    if (event.type === 'reassigned' && detail.previousAssignee !== null) {
      parts.push(`原处理人：${detail.previousAssignee.name}`);
    }
    return <div className="event-detail">{parts.join(' · ')}</div>;
  }
  if (
    event.type === 'cancelled' &&
    isCancelledEventDetail(event.detail) &&
    event.detail.reason !== null
  ) {
    return <div className="event-detail">取消原因：{event.detail.reason}</div>;
  }
  return null;
}

function describeEvent(event: TicketEvent): string {
  const actor = event.actor.name;
  switch (event.type) {
    case 'created':
      return `${actor} 创建了工单`;
    case 'dispatched':
      return `${actor} 将工单转入分配流程`;
    case 'assigned':
      return `${actor} 指派了工单`;
    case 'reassigned':
      return `${actor} 转派了工单`;
    case 'completed':
      return `${actor} 完成处理`;
    case 'cancelled':
      return `${actor} 取消了工单`;
    case 'rated':
      return `${actor} 提交了满意度评价`;
  }
}

/** 事件时间线：分配 / 转派 / 完成 / 取消 / 评价全程可追溯。 */
export function EventTimeline({ events }: { events: TicketEvent[] }) {
  if (events.length === 0) {
    return <p className="muted small">暂无处理记录。</p>;
  }
  const sorted = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <ol className="event-list">
      {sorted.map((event) => (
        <li key={event.id} className={`event-item ev-${event.type}`}>
          <span className="event-dot" aria-hidden="true" />
          <div className="event-body">
            <div className="event-head">
              <span className="event-title">{describeEvent(event)}</span>
              <span className={`event-type-chip ev-chip-${event.type}`}>{eventLabel(event.type)}</span>
            </div>
            {describeEventDetail(event)}
            <div className="event-meta" title={event.createdAt}>
              {formatDateTime(event.createdAt)}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
