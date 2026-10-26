import type { Pagination } from '../platform/api-client'

interface PaginationProps {
  pagination: Pagination
  onPage: (page: number) => void
}

// 分页控件：基于 page/limit/total 计算上一页/下一页。
export function Pagination({ pagination, onPage }: PaginationProps) {
  const { page, limit, total } = pagination
  const totalPages = Math.max(Math.ceil(total / limit), 1)
  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end = Math.min(page * limit, total)
  return (
    <div className="flex items-center justify-between gap-2 pt-3 text-sm text-[var(--muted)]">
      <span>{total === 0 ? '无数据' : `${start}–${end} / ${total}`}</span>
      <div className="flex gap-2">
        <button className="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</button>
        <button className="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>下一页</button>
      </div>
    </div>
  )
}
