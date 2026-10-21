import type { TicketListItem } from '../types'
import { formatDateTime, PriorityBadge, StatusBadge } from './ui'

/** 工单列表行：工作台与我的工单共用；点击选中后在右侧展示详情。 */
export function TicketRow({
  ticket,
  selected,
  onSelect,
}: {
  ticket: TicketListItem
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full border-l-4 px-4 py-3 text-left transition-colors ${
        selected ? 'border-indigo-500 bg-indigo-50/60' : 'border-transparent hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-medium text-slate-500">{ticket.ticketNo}</span>
        <span className="flex gap-1.5">
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} />
        </span>
      </div>
      <p className="mt-1.5 truncate text-sm font-medium text-slate-800" title={ticket.subject}>
        {ticket.subject}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
        <span>{ticket.category}</span>
        <span className="text-slate-300">·</span>
        <span>{ticket.submitterName}</span>
        <span className="text-slate-300">·</span>
        <span>{ticket.companyName}</span>
        {ticket.assignedGroupName && (
          <>
            <span className="text-slate-300">·</span>
            <span>{ticket.assignedGroupName}</span>
          </>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {formatDateTime(ticket.createdAt)} · {ticket.replyCount} 条回复
        {ticket.handlerName ? ` · 处理人 ${ticket.handlerName}` : ''}
      </p>
    </button>
  )
}
