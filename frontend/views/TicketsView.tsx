import { TicketsWorkspace } from './TicketsWorkspace';

interface TicketsViewProps {
  selectedTicketId: number | null;
  onSelectTicket: (id: number | null) => void;
}

/** 工单列表视图（左侧导航「工单列表」）。 */
export function TicketsView({ selectedTicketId, onSelectTicket }: TicketsViewProps) {
  return (
    <TicketsWorkspace
      title="工单列表"
      emptyTitle="暂无工单"
      emptyHint="点击「新建工单」创建第一个工单；公司配置分类分配规则后，新工单将按分类自动分配。"
      selectedTicketId={selectedTicketId}
      onSelectTicket={onSelectTicket}
    />
  );
}
