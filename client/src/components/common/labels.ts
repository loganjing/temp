import type { TaskStatus, ResourceStatus, Priority, ResourceType, LocationType } from '@/api/types';

export function taskStatusLabel(status: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    pending: '待分配',
    assigned: '已分配',
    in_transit: '搬运中',
    completed: '已完成',
    cancelled: '已取消',
    error: '异常',
  };
  return map[status] ?? status;
}

export function taskStatusClass(status: TaskStatus): string {
  return `status--${status}`;
}

export function resourceStatusLabel(status: ResourceStatus): string {
  const map: Record<ResourceStatus, string> = {
    idle: '空闲',
    busy: '作业中',
    offline: '离线',
    fault: '故障',
  };
  return map[status] ?? status;
}

export function resourceStatusClass(status: ResourceStatus): string {
  return `status--${status}`;
}

export function priorityLabel(priority: Priority): string {
  const map: Record<Priority, string> = {
    normal: '普通',
    urgent: '紧急',
    highest: '最高',
  };
  return map[priority] ?? priority;
}

export function priorityClass(priority: Priority): string {
  return `priority--${priority}`;
}

export function resourceTypeLabel(type: ResourceType): string {
  return type === 'agv' ? 'AGV' : '叉车';
}

export function locationTypeLabel(type: LocationType): string {
  return type === 'storage' ? '存储位' : '通道节点';
}

export function assignmentMethodLabel(method: string | null): string {
  if (!method) return '—';
  return method === 'auto' ? '自动' : '手动';
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds)) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m} 分 ${rem} 秒`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h} 时 ${rm} 分`;
}

export function formatPercent(rate: number | null | undefined): string {
  if (rate == null || isNaN(rate)) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

export function eventTypeLabel(type: string): string {
  const map: Record<string, string> = {
    task_assigned: '任务分配',
    route_planned: '路径规划完成',
    device_departed: '设备出发',
    position_update: '位置更新',
    yield_paused: '避让暂停',
    yield_resumed: '避让恢复',
    route_replanned: '路径重规划',
    target_arrived: '到达目标',
    anomaly: '异常事件',
    task_completed: '任务完成',
    task_cancelled: '任务取消',
  };
  return map[type] ?? type;
}

export function conflictTypeLabel(type: string): string {
  const map: Record<string, string> = {
    node: '节点冲突',
    oncoming: '对向冲突',
    tailgating: '尾随冲突',
  };
  return map[type] ?? type;
}

export function strategyLabel(strategy: string | null | undefined): string {
  if (!strategy) return '—';
  const map: Record<string, string> = {
    priority_yield: '优先级让行',
    first_arrive: '先到先行',
    detour: '绕行替代',
  };
  return map[strategy] ?? strategy;
}
