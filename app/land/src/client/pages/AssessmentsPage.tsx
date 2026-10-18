import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../platform/api-client'
import { Badge, Card, EmptyState, ErrorBox, Loading, StatusBadge, useResource } from '../components/ui'
import { VERDICT_LABELS, displayDateTime, displayMoney, displayPercent } from '../lib/format'
import type { Paged, QuickAssessmentRow } from '../types'

const PAGE_SIZE = 20

/** M02 快速评估组合：跨地块快评结论总览（州/结论筛选 + 分页），跳转地块评估页。 */
export default function AssessmentsPage() {
  const [state, setState] = useState('')
  const [verdict, setVerdict] = useState('')
  const [page, setPage] = useState(1)

  const listUrl = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (state.trim()) params.set('state', state.trim())
    if (verdict) params.set('verdict', verdict)
    return `/api/quick-assessments?${params.toString()}`
  }, [state, verdict, page])
  const assessments = useResource<Paged<QuickAssessmentRow>>(() => apiRequest(listUrl), [listUrl])

  const data = assessments.data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="stack">
      <div className="topbar">
        <h1>快速评估组合</h1>
        <p className="hint">跨地块的快速试算结论总览；结论与建议动作在地块评估页维护。</p>
      </div>

      <Card title={`快速评估${data ? `（${data.total}）` : ''}`}>
        <div className="toolbar">
          <label className="field">州/区域
            <input value={state} onChange={(event) => { setState(event.currentTarget.value); setPage(1) }} placeholder="按地块所在州筛选" />
          </label>
          <label className="field">结论
            <select value={verdict} onChange={(event) => { setVerdict(event.currentTarget.value); setPage(1) }}>
              <option value="">全部</option>
              {Object.entries(VERDICT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        {assessments.busy && !data && <Loading />}
        <ErrorBox cause={assessments.error} />
        {data && data.items.length === 0 && <EmptyState text="暂无快速评估记录。" />}
        {data && data.items.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>地块</th><th>州</th><th>结论</th><th className="num">GDV</th><th className="num">TDC</th><th className="num">PBT</th><th className="num">PM</th><th>更新时间</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id}>
                    <td><strong title={row.parcelName}>{row.parcelName}</strong></td>
                    <td>{row.state ?? '—'}</td>
                    <td>{row.verdict ? <StatusBadge status={row.verdict} label={VERDICT_LABELS[row.verdict] ?? row.verdict} /> : <Badge tone="neutral">未试算</Badge>}</td>
                    <td className="num">{row.results ? displayMoney(row.results.gdv) : '—'}</td>
                    <td className="num">{row.results ? displayMoney(row.results.tdc) : '—'}</td>
                    <td className="num">{row.results ? displayMoney(row.results.pbt) : '—'}</td>
                    <td className="num">{row.results ? displayPercent(row.results.pm) : '—'}</td>
                    <td className="nowrap">{displayDateTime(row.updatedAt)}</td>
                    <td><Link className="tab-link" to={`/parcels/${encodeURIComponent(row.parcelId)}/assessment`}>进入评估</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && (
          <div className="pagination">
            <span>第 {data.page} / {totalPages} 页 · 共 {data.total} 条</span>
            <div className="row-actions">
              <button className="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button>
              <button className="secondary" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>下一页</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
