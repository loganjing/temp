export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return (
    <div className="pagination-row">
      <span className="subtext">{total === 0 ? '无数据 / No data' : `${start}–${end} / ${total}`}</span>
      <div className="pager">
        <button className="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页 / Previous</button>
        <span className="subtext">第 {page} / {lastPage} 页</span>
        <button className="secondary" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>下一页 / Next</button>
      </div>
    </div>
  )
}
