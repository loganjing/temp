import type { TimelineItem } from '../api/types'

export const TICKET_STATUS_LABELS: Record<string, string> = {
  created: '创建',
  pending_assignment: '待分配',
  pending_process: '待处理',
  completed: '完成',
  cancelled: '取消',
}

export const TICKET_PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3', 'P4'] as const

export const TICKET_EVENT_LABELS: Record<string, string> = {
  TICKET_CREATED: '创建工单',
  TICKET_ASSIGNMENT_ENTERED: '进入分配',
  TICKET_ASSIGNED: '分配到业务组',
  TICKET_TRANSFERRED: '转派工单',
  TICKET_COMPLETED: '完成处理',
  TICKET_CANCELLED: '取消工单',
  TICKET_RATED: '满意度评价',
}

export const MAIL_KIND_LABELS: Record<string, string> = {
  ticket_completed_notice: '工单完成通知',
}

export const MAIL_STATUS_LABELS: Record<string, string> = {
  recorded: '已记录',
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function timelineOperatorName(operator: TimelineItem['operator']): string {
  return operator === 'system' ? '系统' : operator.fullName
}

// 契约规定时间线 payload 携带分配/转派目标组等上下文；仅安全读取已知键做补充说明。
function readPayloadText(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

export function timelineItemDetail(item: TimelineItem): string | null {
  switch (item.type) {
    case 'TICKET_ASSIGNED':
      return readPayloadText(item.payload, ['groupName', 'toGroupName', 'group'])
    case 'TICKET_TRANSFERRED': {
      const parts = [
        readPayloadText(item.payload, ['fromGroupName', 'fromGroup']),
        readPayloadText(item.payload, ['toGroupName', 'toGroup']),
      ]
        .filter((value): value is string => value !== null)
      return parts.length > 0 ? parts.join(' → ') : null
    }
    case 'TICKET_RATED': {
      const rating = item.payload['rating']
      return typeof rating === 'number' ? `评分 ${rating}/5` : null
    }
    default:
      return null
  }
}
