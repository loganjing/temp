export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-xs text-slate-500">
      <span>{total === 0 ? '无记录' : `${from}–${to} / 共 ${total}`}</span>
      <div className="flex gap-2">
        <button type="button" className="secondary !min-h-0 !px-2.5 !py-1 disabled:opacity-50" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          上一页
        </button>
        <span className="px-1 leading-6">{page} / {totalPages}</span>
        <button type="button" className="secondary !min-h-0 !px-2.5 !py-1 disabled:opacity-50" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          下一页
        </button>
      </div>
    </div>
  )
}
