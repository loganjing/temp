import { PRIORITY_BADGE_CLASS, PRIORITY_LABELS, STATUS_BADGE_CLASS, STATUS_LABELS } from '../domain/labels'

const badgeBaseClass = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap'

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`${badgeBaseClass} ${STATUS_BADGE_CLASS[status] ?? 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-300'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`${badgeBaseClass} ${PRIORITY_BADGE_CLASS[priority] ?? 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-300'}`}>
      {PRIORITY_LABELS[priority] ?? priority}
    </span>
  )
}

export function RatingStars({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-sm" aria-label={`满意度 ${score} 分（满分 5 分）`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <span key={value} className={value <= score ? 'text-amber-500' : 'text-slate-300'} aria-hidden>
          ★
        </span>
      ))}
    </span>
  )
}
