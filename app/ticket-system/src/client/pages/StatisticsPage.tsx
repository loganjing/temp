import { useCallback, useEffect, useState } from 'react'
import { getDistribution, getDashboard } from '../api/stats-api'
import { listCompanies } from '../api/org-api'
import type { DistributionItem, Dashboard, Company, DistributionDimension } from '../api/types'
import { Loading, ErrorState } from '../components/States'
import { formatDuration, STATUS_LABEL } from '../components/format'

export default function StatisticsPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyId, setCompanyId] = useState('')
  const [dimension, setDimension] = useState<DistributionDimension>('company')
  const [distribution, setDistribution] = useState<DistributionItem[]>([])
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [dist, dash] = await Promise.all([
        getDistribution(companyId || undefined, dimension),
        getDashboard(companyId || undefined),
      ])
      setDistribution(dist)
      setDashboard(dash)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载统计数据失败')
    } finally {
      setLoading(false)
    }
  }, [companyId, dimension])

  useEffect(() => { void listCompanies().then(setCompanies).catch(() => {}) }, [])
  useEffect(() => { void load() }, [load])

  return (
    <div className="stats-page">
      <div className="filter-bar">
        <label className="filter-item">
          <span>公司</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">当前公司</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="filter-item">
          <span>分布维度</span>
          <select value={dimension} onChange={(e) => setDimension(e.target.value as DistributionDimension)}>
            <option value="company">按公司</option>
            <option value="department">按部门</option>
          </select>
        </label>
      </div>

      {loading ? <Loading /> : error ? <ErrorState message={error} /> : dashboard && (
        <>
          <div className="kpi-grid">
            <div className="card kpi-card">
              <h3>工单总量</h3>
              <p className="kpi-value">{dashboard.ticketCount.total}</p>
              <ul className="kpi-breakdown">
                {Object.entries(dashboard.ticketCount).filter(([k]) => k !== 'total').map(([k, v]) => (
                  <li key={k}><span>{STATUS_LABEL[k.replace(/([A-Z])/g, '_$1').toLowerCase()] ?? k}</span><strong>{v}</strong></li>
                ))}
              </ul>
            </div>
            <div className="card kpi-card">
              <h3>平均响应时间</h3>
              <p className="kpi-value">{formatDuration(dashboard.avgResponseTimeMs)}</p>
              <p className="subtext">已完成工单从创建到完成的平均耗时</p>
            </div>
            <div className="card kpi-card">
              <h3>满意度汇总</h3>
              <p className="kpi-value">{dashboard.satisfaction.count > 0 ? `${dashboard.satisfaction.average.toFixed(1)} / 5` : '暂无评价'}</p>
              <p className="subtext">{dashboard.satisfaction.count} 条评价</p>
            </div>
          </div>

          <div className="stats-section">
            <h3>热点问题分类</h3>
            {dashboard.hotCategories.length === 0 ? <p className="subtext">暂无数据</p> : (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>排名</th><th>分类</th><th>工单数</th></tr></thead>
                  <tbody>{dashboard.hotCategories.map((c, i) => (
                    <tr key={c.category}><td>{i + 1}</td><td>{c.category}</td><td>{c.count}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>

          <div className="stats-section">
            <h3>工单分布（{dimension === 'company' ? '按公司' : '按部门'}）</h3>
            {distribution.length === 0 ? <p className="subtext">暂无数据</p> : (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>{dimension === 'company' ? '公司' : '部门'}</th><th>总数</th><th>待处理</th><th>已完成</th><th>已取消</th></tr></thead>
                  <tbody>{distribution.map((d) => (
                    <tr key={d.dimensionKey}>
                      <td>{d.dimensionName}</td>
                      <td>{d.total}</td>
                      <td>{d.pendingProcess}</td>
                      <td>{d.completed}</td>
                      <td>{d.cancelled}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
