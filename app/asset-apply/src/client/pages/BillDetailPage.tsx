import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getBill, type Bill } from '../api'
import { formatDateTime, statusBadgeClass } from '../format'
import { ApiRequestError } from '../platform/api-client'

export default function BillDetailPage() {
  const { id } = useParams()
  const [bill, setBill] = useState<Bill | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    setError(null)
    getBill(id)
      .then((data) => {
        if (cancelled) return
        setBill(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ApiRequestError && (err.status === 404 || err.code === 'BILL_NOT_FOUND')) {
          setNotFound(true)
        } else {
          setError(err instanceof Error ? err.message : '加载失败')
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, reloadTick])

  if (loading) return <div className="table-state" role="status">加载中…</div>
  if (notFound) {
    return (
      <div className="table-state" role="alert">
        领用单不存在。
        <Link to="/" className="table-state-link">返回列表</Link>
      </div>
    )
  }
  if (error) {
    return (
      <div className="table-state table-state-error" role="alert">
        <span>加载失败：{error}</span>
        <button type="button" className="btn btn-secondary" onClick={() => setReloadTick((tick) => tick + 1)}>
          重试
        </button>
      </div>
    )
  }
  if (!bill) return null

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">领用单详情</h1>
          <p className="page-subtitle">
            {bill.billno} · <span className={statusBadgeClass(bill.billstatus)}>{bill.billstatus}</span>
          </p>
        </div>
        <div className="page-actions">
          <Link to={`/bills/${bill.id}/print`} className="btn btn-primary">打印</Link>
          <Link to="/" className="btn btn-ghost">返回列表</Link>
        </div>
      </div>

      <section className="card form-section">
        <h2 className="card-title">主表信息</h2>
        <dl className="detail-grid">
          <div className="detail-item"><dt>领用单号</dt><dd>{bill.billno}</dd></div>
          <div className="detail-item"><dt>领用日期</dt><dd>{bill.pickDate}</dd></div>
          <div className="detail-item"><dt>领用人</dt><dd>{bill.picker}</dd></div>
          <div className="detail-item"><dt>领用部门</dt><dd>{bill.pickDept}</dd></div>
          <div className="detail-item"><dt>组织</dt><dd>{bill.org}</dd></div>
          <div className="detail-item"><dt>单据状态</dt><dd>{bill.billstatus}</dd></div>
          <div className="detail-item"><dt>用途说明</dt><dd>{bill.purpose ?? '—'}</dd></div>
          <div className="detail-item"><dt>备注</dt><dd>{bill.remark ?? '—'}</dd></div>
          <div className="detail-item"><dt>创建人</dt><dd>{bill.creator}</dd></div>
          <div className="detail-item"><dt>创建时间</dt><dd>{formatDateTime(bill.createtime)}</dd></div>
          <div className="detail-item"><dt>修改人</dt><dd>{bill.modifier}</dd></div>
          <div className="detail-item"><dt>修改时间</dt><dd>{formatDateTime(bill.modifytime)}</dd></div>
          <div className="detail-item"><dt>审核人</dt><dd>{bill.auditor ?? '—'}</dd></div>
          <div className="detail-item"><dt>审核日期</dt><dd>{bill.auditdate ? formatDateTime(bill.auditdate) : '—'}</dd></div>
        </dl>
      </section>

      <section className="card form-section">
        <h2 className="card-title">明细分录</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>行号</th>
              <th>资产名称</th>
              <th>资产编码</th>
              <th>规格型号</th>
              <th>数量</th>
              <th>单位</th>
              <th>存放位置</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {bill.entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.seq}</td>
                <td>{entry.assetName}</td>
                <td>{entry.assetCode ?? '—'}</td>
                <td>{entry.specModel ?? '—'}</td>
                <td>{entry.qty}</td>
                <td>{entry.unit ?? '—'}</td>
                <td>{entry.location ?? '—'}</td>
                <td>{entry.lineRemark ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
