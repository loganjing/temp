import type { VisitorStatus } from '../../shared/visitor-types'

interface StatusBadgeProps {
  status: VisitorStatus
}

const STATUS_CONFIG: Record<VisitorStatus, { label: string; className: string }> = {
  pending: {
    label: '待审批',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  approved: {
    label: '已通过',
    className: 'bg-green-50 text-green-700 border-green-200',
  },
  rejected: {
    label: '已驳回',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  )
}
