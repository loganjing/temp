import { formatDateTime, localizedName, localizedUser, subjectOf } from '../domain/format'
import type { TicketSummary } from '../domain/types'
import { useLocale, usePlatformText } from '../platform/i18n'
import { PriorityBadge, SlaBadgeView, StatusBadge, TableShell, Td, Th, Truncate } from './ui'

/** 工单列表通用表格：默认 updatedAt 倒序数据源 + 更新时间列可见 */
export function TicketTable({ tickets, onOpen }: { tickets: TicketSummary[]; onOpen: (ticket: TicketSummary) => void }) {
  const t = usePlatformText()
  const { locale } = useLocale()
  return (
    <TableShell>
      <thead>
        <tr>
          <Th>{t('tickets.col.ticketNo')}</Th>
          <Th>{t('tickets.col.subject')}</Th>
          <Th>{t('common.category')}</Th>
          <Th>{t('common.priority')}</Th>
          <Th>{t('common.status')}</Th>
          <Th>{t('tickets.col.assignee')}</Th>
          <Th>{t('sla.firstResponse')}</Th>
          <Th>{t('sla.resolution')}</Th>
          <Th>{t('common.updatedAt')}</Th>
        </tr>
      </thead>
      <tbody>
        {tickets.map((ticket) => (
          <tr key={ticket.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpen(ticket)}>
            <Td className="whitespace-nowrap font-mono text-xs text-slate-500">{ticket.ticketNo ?? '—'}</Td>
            <Td>
              <Truncate text={subjectOf(ticket, locale)} />
            </Td>
            <Td>
              <Truncate text={localizedName(ticket.category, locale)} className="max-w-[10rem]" />
            </Td>
            <Td>
              <PriorityBadge priority={ticket.priority} label={t(`ticket.priority.${ticket.priority}`)} />
            </Td>
            <Td>
              <StatusBadge status={ticket.status} label={t(`ticket.status.${ticket.status}`)} />
            </Td>
            <Td>
              <Truncate text={ticket.assignee ? localizedUser(ticket.assignee, locale) : '—'} className="max-w-[8rem]" />
            </Td>
            <Td>
              <SlaBadgeView badge={ticket.slaFirstResponse} />
            </Td>
            <Td>
              <SlaBadgeView badge={ticket.slaResolution} />
            </Td>
            <Td className="whitespace-nowrap text-slate-500">{formatDateTime(ticket.updatedAt)}</Td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  )
}
