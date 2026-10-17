import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Category, Ticket, TicketStatus } from '../api/types';
import { apiErrorMessage, listCategories, listTickets } from '../api/client';
import { useCurrentUser } from '../app/currentUser';
import { statusLabel } from '../app/labels';
import { EmptyState, ErrorBanner, SkeletonRows } from '../components/common';
import { TicketTable } from '../tickets/TicketTable';
import { TicketCreateModal } from '../tickets/TicketCreateModal';
import { TicketDetail } from '../tickets/TicketDetail';

interface FilterState {
  status: TicketStatus | '';
  categoryId: number | '';
  companyId: number | '';
  submitterId: number | '';
}

const EMPTY_FILTERS: FilterState = {
  status: '',
  categoryId: '',
  companyId: '',
  submitterId: '',
};

const STATUS_OPTIONS: ReadonlyArray<TicketStatus> = [
  'created',
  'pending_assignment',
  'processing',
  'completed',
  'cancelled',
];

interface TicketsWorkspaceProps {
  title: string;
  /** 固定状态筛选（待分配队列锁定 pending_assignment）。 */
  lockedStatus?: TicketStatus;
  notice?: string;
  emptyTitle: string;
  emptyHint: string;
  selectedTicketId: number | null;
  onSelectTicket: (id: number | null) => void;
}

/**
 * 工单 master-detail 工作区（工单列表与待分配队列共用）。
 * master：筛选 + 可扫读表格；detail：工单详情与全部操作。
 */
export function TicketsWorkspace({
  title,
  lockedStatus,
  notice,
  emptyTitle,
  emptyHint,
  selectedTicketId,
  onSelectTicket,
}: TicketsWorkspaceProps) {
  const { users, currentUser } = useCurrentUser();
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  // 筛选数据源：分类来自 /api/categories；公司从用户列表聚合；提交人即用户列表。
  useEffect(() => {
    if (currentUser === null) return;
    let cancelled = false;
    listCategories()
      .then((list) => {
        if (!cancelled) setCategories(list);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const companies = useMemo(() => {
    const map = new Map<number, string>();
    for (const user of users) map.set(user.company.id, user.company.name);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [users]);

  const effectiveStatus = lockedStatus ?? filters.status;

  useEffect(() => {
    if (currentUser === null) return;
    let cancelled = false;
    setLoading(true);
    setListError(null);
    listTickets({
      status: effectiveStatus === '' ? undefined : effectiveStatus,
      categoryId: filters.categoryId === '' ? undefined : filters.categoryId,
      companyId: filters.companyId === '' ? undefined : filters.companyId,
      submitterId: filters.submitterId === '' ? undefined : filters.submitterId,
    })
      .then((list) => {
        if (!cancelled) setTickets(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setListError(apiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser, effectiveStatus, filters, reloadTick]);

  const refresh = useCallback(() => setReloadTick((n) => n + 1), []);

  const setFilter = useCallback((patch: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleCreated = useCallback(
    (ticket: Ticket) => {
      setCreateOpen(false);
      refresh();
      onSelectTicket(ticket.id);
    },
    [refresh, onSelectTicket],
  );

  return (
    <div className="page tickets-page">
      <div className="page-toolbar">
        <h2 className="page-title">{title}</h2>
        <div className="toolbar-spacer" />
        <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          <Plus size={15} /> 新建工单
        </button>
      </div>
      {notice !== undefined && <div className="notice notice-info">{notice}</div>}
      <div className="filters-bar">
        {lockedStatus === undefined ? (
          <label className="filter-field">
            <span className="filter-label">状态</span>
            <select
              className="select"
              value={filters.status}
              onChange={(e) => {
                const value = e.target.value;
                const status = STATUS_OPTIONS.find((s) => s === value);
                setFilter({ status: status ?? '' });
              }}
              aria-label="按状态筛选"
            >
              <option value="">全部状态</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="filter-locked">
            <span className="filter-label">状态</span>
            <span className="badge badge-status-pending">{statusLabel(lockedStatus)}</span>
          </span>
        )}
        <label className="filter-field">
          <span className="filter-label">分类</span>
          <select
            className="select"
            value={filters.categoryId}
            onChange={(e) =>
              setFilter({ categoryId: e.target.value === '' ? '' : Number(e.target.value) })
            }
            aria-label="按分类筛选"
          >
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span className="filter-label">公司</span>
          <select
            className="select"
            value={filters.companyId}
            onChange={(e) =>
              setFilter({ companyId: e.target.value === '' ? '' : Number(e.target.value) })
            }
            aria-label="按公司筛选"
          >
            <option value="">全部公司</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span className="filter-label">提交人</span>
          <select
            className="select"
            value={filters.submitterId}
            onChange={(e) =>
              setFilter({ submitterId: e.target.value === '' ? '' : Number(e.target.value) })
            }
            aria-label="按提交人筛选"
          >
            <option value="">全部提交人</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setFilters(EMPTY_FILTERS)}
          aria-label="清除筛选"
        >
          清除筛选
        </button>
      </div>
      <div className="master-detail">
        <section className="master" aria-label="工单列表">
          {loading ? (
            <div className="card">
              <SkeletonRows rows={7} cols={8} />
            </div>
          ) : listError !== null ? (
            <div className="card card-pad">
              <ErrorBanner
                message={`工单列表加载失败：${listError}`}
                onRetry={() => setReloadTick((n) => n + 1)}
              />
            </div>
          ) : tickets !== null && tickets.length === 0 ? (
            <div className="card card-pad">
              <EmptyState
                title={emptyTitle}
                hint={emptyHint}
                action={
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus size={15} /> 新建工单
                  </button>
                }
              />
            </div>
          ) : tickets !== null ? (
            <TicketTable
              tickets={tickets}
              selectedId={selectedTicketId}
              onSelect={(id) => onSelectTicket(id)}
            />
          ) : null}
        </section>
        <section className="detail" aria-label="工单详情">
          {selectedTicketId === null ? (
            <div className="card card-pad">
              <EmptyState
                title="未选择工单"
                hint="在左侧列表中点击工单，查看详情并执行回复、分配、转派、完成、取消与评价操作。"
              />
            </div>
          ) : (
            <TicketDetail
              key={selectedTicketId}
              ticketId={selectedTicketId}
              onChanged={refresh}
              onOpenTicket={(id) => onSelectTicket(id)}
              onClose={() => onSelectTicket(null)}
            />
          )}
        </section>
      </div>
      {createOpen && (
        <TicketCreateModal onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}
