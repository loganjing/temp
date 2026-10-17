import { TicketsWorkspace } from './TicketsWorkspace';

interface QueueViewProps {
  selectedTicketId: number | null;
  onSelectTicket: (id: number | null) => void;
}

/** 待分配队列视图：待人工分配的工单（状态 = 待分配）。 */
export function QueueView({ selectedTicketId, onSelectTicket }: QueueViewProps) {
  return (
    <TicketsWorkspace
      title="待分配队列"
      lockedStatus="pending_assignment"
      notice="此处汇集进入分配流程的工单。分类未命中分配规则的新工单停留在「创建」状态，可在工单列表中打开分配面板使其进入队列。"
      emptyTitle="队列为空"
      emptyHint="暂无待分配工单。工单进入分配流程后会出现在这里，届时可为它指派业务组与处理人。"
      selectedTicketId={selectedTicketId}
      onSelectTicket={onSelectTicket}
    />
  );
}
