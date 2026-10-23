const STATUS_MAP = {
  pending: { label: '待处理', class: 'badge-warning' },
  in_progress: { label: '执行中', class: 'badge-info' },
  completed: { label: '已完成', class: 'badge-success' },
  has_obstacle_completed: { label: '有障碍-已完成', class: 'badge-warning' },
  resolved: { label: '已处理', class: 'badge-success' },
  active: { label: '活跃', class: 'badge-warning' },
};

export default function StatusBadge({ status }) {
  const config = STATUS_MAP[status] || { label: status, class: 'badge-muted' };
  return <span className={`badge ${config.class}`}>{config.label}</span>;
}
