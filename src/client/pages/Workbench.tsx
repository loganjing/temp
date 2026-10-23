/**
 * Workbench page — split-master-detail layout.
 * Left: filterable, searchable, sortable ticket list with pagination.
 * Right: ticket detail panel (rendered by TicketDetail component).
 */

import { useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAsync } from '../hooks';
import { useAuth } from '../auth';
import { mockCategories } from '../mock-data';
import type { WorkbenchQuery, SlaPriority, TicketStatus } from '../types';
import { StatusBadge, PriorityBadge, priorityOrder, SkeletonList, EmptyState, ErrorState, Pagination } from '../components/ui';
import { TicketDetailPanel } from './TicketDetail';

export function WorkbenchPage() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const { ticketId } = useParams<{ ticketId?: string }>();
  const selectedId = ticketId ? Number(ticketId) : null;

  const [filters, setFilters] = useState<WorkbenchQuery>({
    sortBy: 'createdAt',
    sortOrder: 'desc',
    page: 1,
    pageSize: 15,
  });

  const query = useMemo(() => filters, [filters]);
  const loadTickets = useCallback(() => api.workbenchTickets(query), [query]);
  const { data, loading, error, retry } = useAsync(loadTickets, [query]);

  const [categories] = useState(mockCategories);

  const updateFilter = (patch: Partial<WorkbenchQuery>) =>
    setFilters((f) => ({ ...f, ...patch, page: 1 }));

  const onPageChange = (page: number) =>
    setFilters((f) => ({ ...f, page }));

  const isHandler = hasRole('handler');

  if (!isHandler && !hasRole('admin')) {
    return (
      <div className="state-container">
        <div className="state-icon">🔒</div>
        <div className="state-title">无权限</div>
        <div className="state-desc">工单工作台仅对处理人和管理员开放</div>
      </div>
    );
  }

  return (
    <div className="split-layout">
      {/* Master: ticket list */}
      <div className="split-master">
        <div className="filter-bar">
          <input
            type="text"
            className="form-input search-input"
            placeholder="搜索主题/描述…"
            value={filters.keyword ?? ''}
            onChange={(e) => updateFilter({ keyword: e.target.value || undefined })}
          />
          <select
            className="form-select"
            value={filters.slaPriority ?? ''}
            onChange={(e) =>
              updateFilter({
                slaPriority: (e.target.value || undefined) as SlaPriority | undefined,
              })
            }
          >
            <option value="">全部优先级</option>
            {priorityOrder.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            className="form-select"
            value={filters.categoryId ?? ''}
            onChange={(e) =>
              updateFilter({
                categoryId: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          >
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            className="form-select"
            value={`${filters.sortBy ?? 'createdAt'}:${filters.sortOrder ?? 'desc'}`}
            onChange={(e) => {
              const [sortBy, sortOrder] = e.target.value.split(':') as [
                'createdAt' | 'slaPriority',
                'asc' | 'desc',
              ];
              updateFilter({ sortBy, sortOrder });
            }}
          >
            <option value="createdAt:desc">创建时间 ↓</option>
            <option value="createdAt:asc">创建时间 ↑</option>
            <option value="slaPriority:desc">优先级 ↓</option>
            <option value="slaPriority:asc">优先级 ↑</option>
          </select>
        </div>

        <div className="ticket-list">
          {loading && <SkeletonList count={6} />}
          {error && (
            <ErrorState
              message={error instanceof ApiError ? error.message : '加载工单失败'}
              onRetry={retry}
            />
          )}
          {!loading && !error && (!data?.items || data.items.length === 0) && (
            <EmptyState title="暂无待处理工单" description="当前筛选条件下没有工单" />
          )}
          {!loading && !error && data?.items.map((ticket) => (
            <div
              key={ticket.id}
              className={`ticket-item ${selectedId === ticket.id ? 'selected' : ''}`}
              onClick={() => navigate(`/workbench/${ticket.id}`)}
            >
              <div className="ticket-item-title">{ticket.title}</div>
              <div className="ticket-item-meta">
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.slaPriority} />
                <span>{ticket.categoryName}</span>
                <span>·</span>
                <span>{ticket.submitterName}</span>
              </div>
              <div className="ticket-item-desc">{ticket.description}</div>
              <div className="text-sm text-secondary mt-8">
                {new Date(ticket.createdAt).toLocaleString('zh-CN')}
                {ticket.handlerName ? ` · 处理人: ${ticket.handlerName}` : ''}
              </div>
            </div>
          ))}
        </div>

        {!loading && !error && data && (
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={onPageChange}
          />
        )}
      </div>

      {/* Detail panel */}
      <div className="split-detail">
        {selectedId ? (
          <TicketDetailPanel ticketId={selectedId} />
        ) : (
          <EmptyState
            title="请选择工单"
            description="从左侧列表选择一条工单查看详情"
          />
        )}
      </div>
    </div>
  );
}
