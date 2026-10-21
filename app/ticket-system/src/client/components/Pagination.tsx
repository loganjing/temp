import { ChevronLeft, ChevronRight } from 'lucide-react'

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
  disabled,
}: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
  disabled?: boolean
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-2.5">
      <p className="text-xs text-slate-500">
        共 {total} 条 · 第 {page} / {pageCount} 页
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={disabled || page <= 1}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          上一页
        </button>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={disabled || page >= pageCount}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          下一页
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
