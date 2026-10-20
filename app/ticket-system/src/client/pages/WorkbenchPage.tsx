import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TicketDetail } from '../components/ticket/TicketDetail'
import { TicketListPanel } from '../components/TicketListPanel'
import { EmptyState } from '../components/ui'

export default function WorkbenchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('ticket')
  const [version, setVersion] = useState(0)

  const selectTicket = (ticketId: string) => {
    setSearchParams({ ticket: ticketId }, { replace: true })
  }

  return (
    <div className="flex h-full">
      <div className="flex w-[46%] min-w-[600px] shrink-0 flex-col border-r border-slate-200">
        <TicketListPanel variant="workbench" selectedId={selectedId} onSelect={selectTicket} version={version} />
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto bg-slate-50">
        {selectedId ? (
          <TicketDetail
            ticketId={selectedId}
            onTicketMutated={() => setVersion(value => value + 1)}
            onOpenTicket={selectTicket}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState title="选择左侧工单查看详情" description="支持筛选、关键词搜索、排序与公司维度筛选定位工单" />
          </div>
        )}
      </div>
    </div>
  )
}
