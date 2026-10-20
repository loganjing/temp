import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CreateTicketForm } from '../components/CreateTicketForm'
import { TicketDetail } from '../components/ticket/TicketDetail'
import { TicketListPanel } from '../components/TicketListPanel'
import { EmptyState, Modal } from '../components/ui'
import { useToast } from '../components/Toast'

export default function MyTicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('ticket')
  const [version, setVersion] = useState(0)
  const [creating, setCreating] = useState(false)
  const toast = useToast()

  const selectTicket = (ticketId: string) => {
    setSearchParams({ ticket: ticketId }, { replace: true })
  }

  return (
    <div className="flex h-full">
      <div className="flex w-[46%] min-w-[600px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <span className="text-sm font-semibold text-slate-900">我的工单</span>
          <button type="button" className="btn-primary py-1.5" onClick={() => setCreating(true)}>
            新建工单
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <TicketListPanel variant="mine" selectedId={selectedId} onSelect={selectTicket} version={version} />
        </div>
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
            <EmptyState title="选择工单查看详情" description="可查看回复、处理进度并完成满意度评价" />
          </div>
        )}
      </div>
      <Modal open={creating} title="新建工单" onClose={() => setCreating(false)}>
        <CreateTicketForm
          onCancel={() => setCreating(false)}
          onCreated={ticket => {
            setCreating(false)
            toast.push('success', `工单 ${ticket.id} 创建成功`)
            setVersion(value => value + 1)
            setSearchParams({ ticket: ticket.id }, { replace: true })
          }}
        />
      </Modal>
    </div>
  )
}
