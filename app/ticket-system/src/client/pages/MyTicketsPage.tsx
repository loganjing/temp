// 我的工单：提交人视角的工单列表与详情入口；创建工单；完成后提交满意度评价。

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import CreateTicketForm from '../components/CreateTicketForm'
import TicketDetailPanel from '../components/TicketDetailPanel'
import TicketListPanel from '../components/TicketListPanel'
import { EmptyBlock } from '../components/ui'
import { IconFileText, IconPlus, IconX } from '../components/icons'

export default function MyTicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [creating, setCreating] = useState(false)
  const ticketParam = searchParams.get('ticket')
  const selectedId = ticketParam && /^\d+$/.test(ticketParam) ? Number(ticketParam) : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">我的工单</h1>
        <button type="button" className="btn btn-primary" onClick={() => setCreating((value) => !value)}>
          {creating ? <IconX size={14} /> : <IconPlus size={14} />}
          {creating ? '取消创建' : '创建工单'}
        </button>
      </div>
      {creating && (
        <CreateTicketForm
          onCreated={(ticket) => {
            setCreating(false)
            setSearchParams({ ticket: String(ticket.id) }, { replace: true })
            setRefreshKey((value) => value + 1)
          }}
          onCancel={() => setCreating(false)}
        />
      )}
      <div className="flex flex-col items-start gap-4 xl:flex-row">
        <TicketListPanel
          scope="mine"
          selectedId={selectedId}
          refreshKey={refreshKey}
          onSelect={(ticketId) => setSearchParams(ticketId == null ? {} : { ticket: String(ticketId) }, { replace: true })}
          emptyTitle={selectedId == null && creating ? '工单提交后将显示在这里' : '您还没有提交过工单'}
          emptyHint={selectedId == null && creating ? undefined : '点击右上角“创建工单”提交第一张工单'}
        />
        {selectedId == null ? (
          <section className="card flex w-full flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
              <IconFileText size={28} />
              <EmptyBlock title="从左侧列表选择工单查看详情与回复" />
            </div>
          </section>
        ) : (
          <TicketDetailPanel key={selectedId} ticketId={selectedId} onChanged={() => setRefreshKey((value) => value + 1)} />
        )}
      </div>
    </div>
  )
}
