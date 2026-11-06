// 格式化辅助 —— 依据契约字段语义渲染，不做业务判定
import type { VisitorStatus } from '../api/client';

/** 将 ISO 8601 时间格式化为本地可读文案；解析失败时回退原值 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 审核状态中文标签 —— 契约状态机 pending / approved / rejected */
const STATUS_LABEL: Record<VisitorStatus, string> = {
  pending: '待审核',
  approved: '通过',
  rejected: '拒绝',
};

export function statusLabel(status: VisitorStatus): string {
  return STATUS_LABEL[status] ?? status;
}
