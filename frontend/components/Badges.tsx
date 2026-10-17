import type { Priority, TicketStatus } from '../api/types';
import { priorityLabel, statusLabel } from '../app/labels';

const STATUS_CLASS: Record<TicketStatus, string> = {
  created: 'badge-status-created',
  pending_assignment: 'badge-status-pending',
  processing: 'badge-status-processing',
  completed: 'badge-status-completed',
  cancelled: 'badge-status-cancelled',
};

const PRIORITY_CLASS: Record<Priority, string> = {
  P0: 'badge-priority-P0',
  P1: 'badge-priority-P1',
  P2: 'badge-priority-P2',
  P3: 'badge-priority-P3',
  P4: 'badge-priority-P4',
};

/** 状态徽章（五种状态各自可区分的配色）。 */
export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}>{statusLabel(status)}</span>;
}

/** 优先级标签。 */
export function PriorityTag({ priority }: { priority: Priority }) {
  return (
    <span className={`badge ${PRIORITY_CLASS[priority]}`}>
      {priority} {priorityLabel(priority)}
    </span>
  );
}
