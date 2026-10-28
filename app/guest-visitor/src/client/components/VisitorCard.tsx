import type { VisitorListItem } from '../../shared/visitor-types'
import StatusBadge from './StatusBadge'

interface VisitorCardProps {
  visitor: VisitorListItem
  onClick: () => void
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function VisitorCard({ visitor, onClick }: VisitorCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-lg border border-neutral-200 bg-white p-3.5 text-left transition active:bg-neutral-50 hover:border-neutral-300"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-neutral-900">{visitor.name}</p>
          <p className="mt-0.5 truncate text-sm text-neutral-500">{visitor.company}</p>
        </div>
        <StatusBadge status={visitor.status} />
      </div>
      <dl className="mt-2.5 space-y-1 text-sm">
        <div className="flex items-center gap-1.5">
          <dt className="shrink-0 text-neutral-400">被访人</dt>
          <dd className="truncate text-neutral-700">{visitor.hostName}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="shrink-0 text-neutral-400">预计到访</dt>
          <dd className="truncate text-neutral-700">{formatTime(visitor.expectedVisitTime)}</dd>
        </div>
      </dl>
    </button>
  )
}
