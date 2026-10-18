import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getBill, type Bill } from '../api'
import { ApiRequestError } from '../platform/api-client'

/** 打印视图：A4 纵向，`@media print` 隐藏应用壳；只读回读，不发起写操作。 */
export default function BillPrintPage() {
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
    <div className="print-page">
      <div className="page-toolbar no-print">
        <Link to={`/bills/${bill.id}`} className="btn btn-ghost">返回详情</Link>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>打印</button>
      </div>

      <article className="print-sheet">
        <header className="print-header">
          <h1>资产领用单</h1>
          <p className="print-billno">单号：{bill.billno}</p>
        </header>

        <table className="print-info">
          <tbody>
            <tr>
              <th>领用单号</th>
              <td>{bill.billno}</td>
              <th>领用日期</th>
              <td>{bill.pickDate}</td>
            </tr>
            <tr>
              <th>领用人</th>
              <td>{bill.picker}</td>
              <th>领用部门</th>
              <td>{bill.pickDept}</td>
            </tr>
            <tr>
              <th>用途说明</th>
              <td colSpan={3}>{bill.purpose ?? ''}</td>
            </tr>
            <tr>
              <th>备注</th>
              <td colSpan={3}>{bill.remark ?? ''}</td>
            </tr>
          </tbody>
        </table>

        <table className="print-entries">
          <thead>
            <tr>
              <th>序号</th>
              <th>资产名称</th>
              <th>资产编码</th>
              <th>规格型号</th>
              <th>数量</th>
              <th>单位</th>
              <th>存放位置</th>
            </tr>
          </thead>
          <tbody>
            {bill.entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.seq}</td>
                <td>{entry.assetName}</td>
                <td>{entry.assetCode ?? ''}</td>
                <td>{entry.specModel ?? ''}</td>
                <td>{entry.qty}</td>
                <td>{entry.unit ?? ''}</td>
                <td>{entry.location ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="print-signatures">
          <div className="signature-item">
            <p>领用人（签字）：<span className="signature-line" aria-hidden="true" /></p>
            <p>日期：<span className="signature-line signature-line-short" aria-hidden="true" /></p>
          </div>
          <div className="signature-item">
            <p>部门负责人（签字）：<span className="signature-line" aria-hidden="true" /></p>
            <p>日期：<span className="signature-line signature-line-short" aria-hidden="true" /></p>
          </div>
          <div className="signature-item">
            <p>资产管理员（签字）：<span className="signature-line" aria-hidden="true" /></p>
            <p>日期：<span className="signature-line signature-line-short" aria-hidden="true" /></p>
          </div>
        </section>
      </article>
    </div>
  )
}
