// 统计与仪表盘：公司/部门维度分布切换 + KPI 指标卡 + 热点分类。
// 访问角色：handler（本公司）/ ops（全量或按公司过滤）；submitter 由路由守卫拦截。

import { useEffect, useState } from 'react'
import { fetchDashboard, fetchDistribution } from '../api'
import { describeApiError } from '../platform/api-client'
import type { DashboardResponse, DistributionResponse } from '../contracts'
import { formatMinutes, formatScore } from '../format'
import { useAuth } from '../state/auth'
import { useCompanyDirectory } from '../state/company-directory'
import { ErrorBlock, LoadingBlock } from '../components/ui'
import { IconRefresh } from '../components/icons'
import { STATUS_LABELS, type TicketStatus } from '../contracts'

const STATUS_ORDER: TicketStatus[] = ['pending_assignment', 'in_progress', 'completed', 'cancelled']

export default function StatsPage() {
  const { user } = useAuth()
  const { companies, register } = useCompanyDirectory()
  const isOps = user.role === 'ops'
  const [dimension, setDimension] = useState<'company' | 'department'>('company')
  const [companyId, setCompanyId] = useState<number | ''>('')
  const [distribution, setDistribution] = useState<DistributionResponse | null>(null)
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)

  const filterCompanyId = isOps && companyId !== '' ? companyId : undefined

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [distributionResult, dashboardResult] = await Promise.all([
          fetchDistribution(dimension, filterCompanyId),
          fetchDashboard(filterCompanyId),
        ])
        if (cancelled) return
        setDistribution(distributionResult)
        setDashboard(dashboardResult)
        if (dimension === 'company') {
          register(distributionResult.items.map((item) => ({ id: Number(item.key), name: item.label })))
        }
      } catch (cause) {
        if (!cancelled) setError(describeApiError(cause))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [dimension, filterCompanyId, nonce, register])

  const items = distribution?.items ?? []
  const totalCount = items.reduce((sum, item) => sum + item.count, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">统计与仪表盘</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-slate-300">
            <button
              type="button"
              className={`h-9 px-4 text-sm font-medium transition-colors ${
                dimension === 'company' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => setDimension('company')}
            >
              公司维度
            </button>
            <button
              type="button"
              className={`h-9 border-l border-slate-300 px-4 text-sm font-medium transition-colors ${
                dimension === 'department' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => setDimension('department')}
            >
              部门维度
            </button>
          </div>
          {isOps && (
            <select
              className="input w-auto"
              value={companyId}
              onChange={(event) => {
                const value = event.currentTarget.value
                setCompanyId(value === '' ? '' : Number(value))
              }}
              aria-label="统计公司范围"
            >
              <option value="">全部公司</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => setNonce((value) => value + 1)}>
            <IconRefresh size={14} />
            刷新
          </button>
        </div>
      </div>

      {loading ? (
        <section className="card">
          <LoadingBlock label="加载统计数据…" />
        </section>
      ) : error ? (
        <section className="card">
          <ErrorBlock message={error} onRetry={() => setNonce((value) => value + 1)} />
        </section>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <section className="card p-4">
              <p className="text-xs font-medium text-slate-500">工单量</p>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums">{dashboard?.ticket_volume.total ?? 0}</p>
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                {STATUS_ORDER.map((status) => (
                  <span key={status}>
                    {STATUS_LABELS[status]} {dashboard?.ticket_volume.by_status[status] ?? 0}
                  </span>
                ))}
              </p>
            </section>
            <section className="card p-4">
              <p className="text-xs font-medium text-slate-500">平均响应时间</p>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums">
                {formatMinutes(dashboard?.avg_response_time_minutes ?? null)}
              </p>
              <p className="mt-2 text-xs text-slate-500">工单创建到首次回复的时间间隔均值</p>
            </section>
            <section className="card p-4">
              <p className="text-xs font-medium text-slate-500">满意度</p>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums">
                {formatScore(dashboard?.satisfaction.average ?? null)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                已评价 {dashboard?.satisfaction.rated_count ?? 0} 张 / 已完成 {dashboard?.satisfaction.completed_count ?? 0} 张
              </p>
            </section>
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <section className="card p-4">
              <h2 className="text-sm font-semibold">热点问题分类</h2>
              <p className="mt-1 mb-3 text-xs text-slate-400">按问题分类聚合的高频工单排序（前 10）</p>
              {(dashboard?.hot_categories.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">暂无数据</p>
              ) : (
                <ul className="space-y-2.5">
                  {dashboard?.hot_categories.map((item, index) => {
                    const maxCount = dashboard.hot_categories[0].count || 1
                    return (
                      <li key={item.category} className="text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="w-4 text-right text-xs tabular-nums text-slate-400">{index + 1}</span>
                            <span className="truncate" title={item.category}>
                              {item.category}
                            </span>
                          </span>
                          <span className="tabular-nums text-slate-600">{item.count}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${Math.max(4, Math.round((item.count / maxCount) * 100))}%` }}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section className="card p-4">
              <h2 className="text-sm font-semibold">
                工单分布明细（{dimension === 'company' ? '公司维度' : '部门维度'}）
              </h2>
              <p className="mt-1 mb-3 text-xs text-slate-400">
                {dimension === 'department' ? '提交人未填写部门的工单归入“未填写”' : '按工单所属公司统计'}
              </p>
              {items.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">暂无数据</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="table-th">{dimension === 'company' ? '公司' : '部门'}</th>
                        <th className="table-th">工单量</th>
                        <th className="table-th w-[38%]">占比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={String(item.key)}>
                          <td className="table-td max-w-[180px]">
                            <span className="block truncate" title={item.label}>
                              {item.label}
                            </span>
                          </td>
                          <td className="table-td tabular-nums">{item.count}</td>
                          <td className="table-td">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-indigo-500"
                                  style={{ width: `${totalCount > 0 ? Math.max(3, Math.round((item.count / totalCount) * 100)) : 0}%` }}
                                />
                              </div>
                              <span className="w-12 text-right text-xs tabular-nums text-slate-500">
                                {totalCount > 0 ? `${Math.round((item.count / totalCount) * 100)}%` : '0%'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
