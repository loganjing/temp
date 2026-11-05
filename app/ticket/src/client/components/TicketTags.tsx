import { Tag } from 'antd'
import { PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL } from '../platform/labels'
import type { Priority, TicketStatus } from '../platform/types'

export function StatusTag({ status }: { status: TicketStatus }) {
  return <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Tag>
}

export function PriorityTag({ priority }: { priority: Priority }) {
  return <Tag color={PRIORITY_COLOR[priority]}>{PRIORITY_LABEL[priority]}</Tag>
}