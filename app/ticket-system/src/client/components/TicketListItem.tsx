import { PriorityBadge, StatusBadge, formatDateTime } from './ui'
import type { Ticket } from '../types'

interface Props {
  ticket: Ticket
  selected: boolean
  onSelect: (id: number) => void
}

export default function TicketListItem({ ticket, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelect(ticket.id)}
      className={`w-full rounded-lg border p-3 text-left transition-colors ${
        selected
          ? 'border-blue-300 bg-blue-50/70'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-slate-500">{ticket.ticketNo}</span>
        <span className="flex items-center gap-1.5">
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} />
        </span>
      </div>
      <p className="mt-1.5 truncate text-sm font-medium text-slate-900" title={ticket.subject}>
        {ticket.subject}
      </p>
      <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-500">
        <span className="truncate">{ticket.categoryName}</span>
        {ticket.groupName && (
          <>
            <span className="text-slate-300">·</span>
            <span className="truncate">{ticket.groupName}</span>
          </>
        )}
        <span className="ml-auto shrink-0 whitespace-nowrap">{formatDateTime(ticket.createdAt)}</span>
      </p>
    </button>
  )
}
