import { buttonSecondaryClass } from './feedback'

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const maxPage = Math.max(Math.ceil(total / pageSize), 1)
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
      <span className="text-xs text-slate-500">{total === 0 ? '共 0 条' : `第 ${from}–${to} 条，共 ${total} 条`}</span>
      <div className="flex items-center gap-2">
        <button type="button" className={buttonSecondaryClass} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          上一页
        </button>
        <span className="text-xs text-slate-500">{page} / {maxPage}</span>
        <button type="button" className={buttonSecondaryClass} disabled={page >= maxPage} onClick={() => onPage(page + 1)}>
          下一页
        </button>
      </div>
    </div>
  )
}
