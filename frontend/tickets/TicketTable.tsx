import type { Ticket } from '../api/types';
import { formatDateTime } from '../app/format';
import { PriorityTag, StatusBadge } from '../components/Badges';

/** 可扫读工单表格：工单号 / 主题 / 分类 / 优先级 / 状态 / 提交人 / 业务组 / 创建时间。 */
export function TicketTable({
  tickets,
  selectedId,
  onSelect,
}: {
  tickets: Ticket[];
  selectedId: number | null;
  onSelect: (ticketId: number) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="ticket-table">
        <thead>
          <tr>
            <th className="col-no">工单号</th>
            <th className="col-subject">主题</th>
            <th>分类</th>
            <th>优先级</th>
            <th>状态</th>
            <th>提交人</th>
            <th>业务组</th>
            <th className="col-time">创建时间</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr
              key={t.id}
              className={t.id === selectedId ? 'row-selected' : undefined}
              tabIndex={0}
              onClick={() => onSelect(t.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(t.id);
                }
              }}
            >
              <td className="mono ticket-no">{t.ticketNo}</td>
              <td className="cell-subject">
                <span className="subject-text" title={t.subject}>
                  {t.subject}
                </span>
              </td>
              <td className="cell-category" title={t.category.name}>
                {t.category.name}
              </td>
              <td>
                <PriorityTag priority={t.priority} />
              </td>
              <td>
                <StatusBadge status={t.status} />
              </td>
              <td
                className="cell-submitter"
                title={`${t.submitter.name}（${t.submitter.company.name}）`}
              >
                {t.submitter.name}
              </td>
              <td className="cell-group" title={t.assignedGroup !== null ? t.assignedGroup.name : undefined}>
                {t.assignedGroup !== null ? (
                  t.assignedGroup.name
                ) : (
                  <span className="muted">未指派</span>
                )}
              </td>
              <td className="cell-time nowrap" title={t.createdAt}>
                {formatDateTime(t.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
