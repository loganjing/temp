/**
 * Statistics dashboard: overview metrics, distribution chart,
 * hot topics, by company/department dimension.
 */

import { useState, useCallback } from 'react';
import { api, ApiError } from '../api';
import { useAsync } from '../hooks';
import { useAuth } from '../auth';
import type { DistributionResponse } from '../types';
import { Skeleton, ErrorState, ForbiddenState } from '../components/ui';

export function StatisticsPage() {
  const { hasRole } = useAuth();
  const [dimension, setDimension] = useState<'company' | 'department'>('company');

  const loadOverview = useCallback(() => api.statisticsOverview(), []);
  const { data: overview, loading: ol, error: oe, retry: or_ } = useAsync(loadOverview, []);

  const loadDistribution = useCallback(
    () => api.statisticsDistribution({ dimension }),
    [dimension],
  );
  const { data: distribution, loading: dl, error: de, retry: dr_ } = useAsync(loadDistribution, [dimension]);

  const loadHotTopics = useCallback(() => api.statisticsHotTopics({ limit: 10 }), []);
  const { data: hotTopics, loading: hl, error: he, retry: hr_ } = useAsync(loadHotTopics, []);

  if (!hasRole('admin')) {
    return <ForbiddenState message="统计仪表盘仅对管理员开放" />;
  }

  return (
    <div>
      <h1 className="text-lg font-bold mb-16">统计仪表盘</h1>

      {/* Overview metrics */}
      {ol ? (
        <div className="stats-grid">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="stat-card">
              <div className="skeleton skeleton-line" style={{ width: '40%', height: 12 }} />
              <div className="skeleton" style={{ width: '60%', height: 28, marginTop: 8 }} />
            </div>
          ))}
        </div>
      ) : oe ? (
        <ErrorState message={oe instanceof ApiError ? oe.message : '加载概览失败'} onRetry={or_} />
      ) : overview ? (
        <div className="stats-grid">
          <MetricCard label="工单总量" value={overview.totalTickets} />
          <MetricCard label="已完成" value={overview.completedTickets} sub={`完成率 ${pct(overview.completedTickets, overview.totalTickets)}`} />
          <MetricCard label="待处理" value={overview.pendingTickets} />
          <MetricCard label="已取消" value={overview.cancelledTickets} />
          <MetricCard label="平均响应时间" value={`${overview.averageResponseTimeMinutes}`} sub="分钟" />
          <MetricCard label="满意度评分" value={overview.averageSatisfaction.toFixed(1)} sub={`${overview.satisfactionCount} 条评价`} />
        </div>
      ) : null}

      {/* Distribution chart */}
      <div className="card mb-16">
        <div className="card-header">
          <span className="card-title">工单分布</span>
          <div className="flex gap-8">
            <button
              className={`btn btn-sm ${dimension === 'company' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setDimension('company')}
            >
              按公司
            </button>
            <button
              className={`btn btn-sm ${dimension === 'department' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setDimension('department')}
            >
              按部门
            </button>
          </div>
        </div>
        <div className="card-body">
          {dl ? (
            <div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton skeleton-line" style={{ height: 22, marginBottom: 10 }} />
              ))}
            </div>
          ) : de ? (
            <ErrorState message={de instanceof ApiError ? de.message : '加载分布失败'} onRetry={dr_} />
          ) : distribution && distribution.items.length > 0 ? (
            <DistributionChart data={distribution} />
          ) : (
            <div className="text-sm text-secondary text-center">暂无分布数据</div>
          )}
        </div>
      </div>

      {/* Hot topics */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">热点问题（按分类）</span>
        </div>
        <div className="card-body">
          {hl ? (
            <div>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton skeleton-line" style={{ height: 22, marginBottom: 10 }} />
              ))}
            </div>
          ) : he ? (
            <ErrorState message={he instanceof ApiError ? he.message : '加载热点失败'} onRetry={hr_} />
          ) : hotTopics && hotTopics.items.length > 0 ? (
            <BarChart
              data={hotTopics.items.map((t) => ({
                label: t.categoryName,
                value: t.ticketCount,
              }))}
            />
          ) : (
            <div className="text-sm text-secondary text-center">暂无热点数据</div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function pct(n: number, d: number): string {
  if (!d) return '0%';
  return `${Math.round((n / d) * 100)}%`;
}

function DistributionChart({ data }: { data: DistributionResponse }) {
  const max = Math.max(...data.items.map((i) => i.total), 1);
  return (
    <div className="bar-chart">
      {data.items.map((item) => (
        <div key={item.label} className="bar-row">
          <div className="bar-label" title={item.label}>{item.label}</div>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${(item.total / max) * 100}%` }}
            >
              {item.total}
            </div>
          </div>
          <div className="bar-value text-sm text-secondary">
            完成 {item.completed} / 待处理 {item.pending}
          </div>
        </div>
      ))}
    </div>
  );
}

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="bar-chart">
      {data.map((d) => (
        <div key={d.label} className="bar-row">
          <div className="bar-label" title={d.label}>{d.label}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(d.value / max) * 100}%` }}>
              {d.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
