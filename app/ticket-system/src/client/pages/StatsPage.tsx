import { useEffect, useState } from 'react'
import { fetchCompanies } from '../api/config'
import { apiErrorText } from '../api/helpers'
import { fetchDashboard, fetchDistribution } from '../api/stats'
import type { Company, DashboardStats, DistributionResult } from '../api/types'
import { EmptyState, ErrorBanner, SkeletonBlock } from '../components/ui'

type Dimension = 'company' | 'department'

export default function StatsPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [company, setCompany] = useState('')
  const [dimension, setDimension] = useState<Dimension>('company')
  const [distribution, setDistribution] = useState<DistributionResult | null>(null)
  const [distributionLoading, setDistributionLoading] = useState(true)
  const [distributionError, setDistributionError] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null)
  const [dashboardLoading, setDashboardLoading] = useState(true)
  const [dashboardError, setDashboardError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCompanies()
      .then(result => {
        if (!cancelled) setCompanies(result.items)
      })
      .catch(() => {
        // 公司选项加载失败时保持空列表，统计错误另行提示
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setDistributionLoading(true)
    setDistributionError(null)
    fetchDistribution(dimension, company || undefined)
      .then(result => {
        if (!cancelled) setDistribution(result)
      })
      .catch(err => {
        if (!cancelled) {
          setDistribution(null)
          setDistributionError(apiErrorText(err))
        }
      })
      .finally(() => {
        if (!cancelled) setDistributionLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [dimension, company])

  useEffect(() => {
    let cancelled = false
    setDashboardLoading(true)
    setDashboardError(null)
    fetchDashboard(company || undefined)
      .then(result => {
        if (!cancelled) setDashboard(result)
      })
      .catch(err => {
        if (!cancelled) {
          setDashboard(null)
          setDashboardError(apiErrorText(err))
        }
      })
      .finally(() => {
        if (!cancelled) setDashboardLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [company])

  const distributionItems = distribution?.items ?? []
  const maxCount = distributionItems.length > 0 ? Math.max(...distributionItems.map(item => item.count), 1) : 1

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-6xl space-y-4 p-4 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-900">统计分析</h1>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xs text-slate-500">公司范围</span>
            <select value={company} onChange={event => setCompany(event.target.value)} className="input-base w-40 py-1.5">
              <option value="">全部公司</option>
              {companies.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            title="工单量"
            value={dashboard ? String(dashboard.totalTickets) : dashboardLoading ? '…' : '—'}
            hint="当前筛选范围内工单总数"
          />
          <KpiCard
            title="平均响应时间"
            value={
              dashboard
                ? dashboard.avgResponseMinutes !== null
                  ? `${dashboard.avgResponseMinutes} 分钟`
                  : '暂无数据'
                : dashboardLoading
                  ? '…'
                  : '—'
            }
            hint="创建至首次回复的平均时长"
          />
          <KpiCard
            title="满意度"
            value={
              dashboard
                ? dashboard.satisfaction.avgScore !== null
                  ? `${dashboard.satisfaction.avgScore} 分`
                  : '暂无评价'
                : dashboardLoading
                  ? '…'
                  : '—'
            }
            hint={dashboard ? `已评价 ${dashboard.satisfaction.ratedCount} 单` : '已评价工单的平均分'}
          />
          <div className="card-base p-4">
            <p className="text-xs text-slate-500">热点问题 Top 5</p>
            {dashboardError ? (
              <p className="mt-2 text-sm text-red-600">{dashboardError}</p>
            ) : dashboard && dashboard.hotCategories.length > 0 ? (
              <ul className="mt-2 space-y-1.5 text-sm">
                {dashboard.hotCategories.map((item, index) => (
                  <li key={item.category} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-slate-700" title={item.category}>
                      {index + 1}. {item.category}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">{item.count} 单</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-400">{dashboardLoading ? '加载中…' : '暂无数据'}</p>
            )}
          </div>
        </div>
        {dashboardError && <ErrorBanner message={dashboardError} />}

        <div className="card-base p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">工单分布</h2>
            <div className="flex rounded-md border border-slate-300 p-0.5 text-sm">
              <button
                type="button"
                onClick={() => setDimension('company')}
                className={`rounded px-3 py-1 ${dimension === 'company' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              >
                按公司
              </button>
              <button
                type="button"
                onClick={() => setDimension('department')}
                className={`rounded px-3 py-1 ${dimension === 'department' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              >
                按部门
              </button>
            </div>
          </div>
          {distributionLoading ? (
            <div className="mt-4 space-y-2.5">
              {Array.from({ length: 4 }, (_, index) => (
                <SkeletonBlock key={index} className="h-5 w-full" />
              ))}
            </div>
          ) : distributionError ? (
            <div className="mt-4">
              <ErrorBanner message={distributionError} />
            </div>
          ) : distributionItems.length === 0 ? (
            <EmptyState title="暂无分布数据" description="当前筛选范围内暂无工单" />
          ) : (
            <>
              <div className="mt-4 space-y-2.5">
                {distributionItems.map(item => {
                  const width = Math.max(4, Math.round((item.count / maxCount) * 100))
                  return (
                    <div key={item.key ?? '__none__'} className="flex items-center gap-3 text-sm">
                      <span className="w-40 shrink-0 truncate text-slate-700" title={item.key ?? undefined}>
                        {item.key ?? '未填写部门'}
                      </span>
                      <div className="h-5 flex-1 rounded bg-slate-100">
                        <div className="h-5 rounded bg-indigo-500" style={{ width: `${width}%` }} />
                      </div>
                      <span className="w-12 shrink-0 text-right text-slate-600">{item.count}</span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">{dimension === 'company' ? '公司' : '部门'}</th>
                      <th className="px-4 py-2 text-right font-medium">工单量</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {distributionItems.map(item => (
                      <tr key={item.key ?? '__none__'}>
                        <td className="px-4 py-2 text-slate-700">{item.key ?? '未填写部门'}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="card-base p-4">
      <p className="text-xs text-slate-500">{title}</p>
      <p className="mt-1.5 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
