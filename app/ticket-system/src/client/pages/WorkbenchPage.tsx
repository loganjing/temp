// 工单工作台：master-detail 布局，待处理队列（默认 in_progress）+ 工单详情。
// 访问角色：handler / ops（submitter 由路由守卫拦截）。

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TicketDetailPanel from '../components/TicketDetailPanel'
import TicketListPanel from '../components/TicketListPanel'
import { EmptyBlock } from '../components/ui'
import { IconInbox } from '../components/icons'

export default function WorkbenchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const ticketParam = searchParams.get('ticket')
  const selectedId = ticketParam && /^\d+$/.test(ticketParam) ? Number(ticketParam) : null

  return (
    <div className="flex flex-col items-start gap-4 xl:flex-row">
      <TicketListPanel
        scope="workbench"
        selectedId={selectedId}
        refreshKey={refreshKey}
        onSelect={(ticketId) => setSearchParams(ticketId == null ? {} : { ticket: String(ticketId) }, { replace: true })}
        emptyTitle="当前筛选条件下没有待处理工单"
        emptyHint="可调整状态、分类、优先级或公司筛选，或修改搜索关键词"
      />
      {selectedId == null ? (
        <section className="card flex w-full flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
            <IconInbox size={28} />
            <EmptyBlock title="从左侧列表选择工单，查看详情并处理" />
          </div>
        </section>
      ) : (
        <TicketDetailPanel key={selectedId} ticketId={selectedId} onChanged={() => setRefreshKey((value) => value + 1)} />
      )}
    </div>
  )
}
