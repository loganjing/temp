import { useCallback, useEffect, useState } from 'react';
import type { StatisticsResponse, StatisticsPeriod, Priority, Resource } from '@/api/types';
import * as statisticsApi from '@/api/statistics';
import * as resourceApi from '@/api/resources';
import { LoadingSkeleton, ErrorState } from '@/components/common/Feedback';
import { useToast } from '@/components/common/Toast';
import { formatApiError } from '@/api/client';
import { formatDuration, formatPercent, priorityLabel } from '@/components/common/labels';
import { PriorityPieChart, ResourceTaskBarChart, UtilizationBarChart } from '@/components/charts/Charts';

const PERIOD_OPTIONS: StatisticsPeriod[] = ['day', 'week', 'month'];

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDaysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function StatisticsPage() {
  const [stats, setStats] = useState<StatisticsResponse | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [period, setPeriod] = useState<StatisticsPeriod>('day');
  const [startDate, setStartDate] = useState(getDaysAgoStr(30));
  const [endDate, setEndDate] = useState(getTodayStr());
  const [resourceId, setResourceId] = useState('');
  const [priority, setPriority] = useState('');

  const toast = useToast();

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await statisticsApi.fetchStatistics({
        startDate,
        endDate,
        period,
        resourceId: resourceId || undefined,
        priority: (priority || undefined) as Priority | undefined,
      });
      setStats(res);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, period, resourceId, priority]);

  useEffect(() => {
    resourceApi.fetchResources().then((r) => setResources(r.resources)).catch(() => {});
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await statisticsApi.exportStatisticsCsv({
        startDate,
        endDate,
        period,
        resourceId: resourceId || undefined,
        priority: (priority || undefined) as Priority | undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'task-statistics.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.showSuccess('CSV 导出成功');
    } catch (err) {
      toast.showError(formatApiError(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="page">
      <div className="page__toolbar">
        <div className="filter-group">
          <div className="period-tabs">
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p}
                className={`period-tab${period === p ? ' period-tab--active' : ''}`}
                onClick={() => setPeriod(p)}
              >
                {p === 'day' ? '按日' : p === 'week' ? '按周' : '按月'}
              </button>
            ))}
          </div>
          <input
            type="date"
            className="filter-control"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <span className="filter-sep">至</span>
          <input
            type="date"
            className="filter-control"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <select className="filter-control" value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
            <option value="">全部设备</option>
            {resources.map((r) => (
              <option key={r.resourceId} value={r.resourceId}>{r.name}</option>
            ))}
          </select>
          <select className="filter-control" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">全部优先级</option>
            <option value="normal">{priorityLabel('normal')}</option>
            <option value="urgent">{priorityLabel('urgent')}</option>
            <option value="highest">{priorityLabel('highest')}</option>
          </select>
          <button className="btn btn--sm" onClick={loadStats}>查询</button>
        </div>
        <button className="btn btn--primary" disabled={exporting} onClick={handleExport}>
          {exporting ? '导出中…' : '导出 CSV'}
        </button>
      </div>

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={loadStats} />
      ) : stats ? (
        <>
          {/* Metric cards */}
          <div className="stat-cards">
            <div className="stat-card">
              <span className="stat-card__label">任务总量</span>
              <span className="stat-card__value">{stats.totalTasks}</span>
            </div>
            <div className="stat-card stat-card--success">
              <span className="stat-card__label">完成率</span>
              <span className="stat-card__value">{formatPercent(stats.completionRate)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">平均搬运时长</span>
              <span className="stat-card__value">{formatDuration(stats.averageDuration)}</span>
            </div>
            <div className="stat-card stat-card--danger">
              <span className="stat-card__label">异常率</span>
              <span className="stat-card__value">{formatPercent(stats.anomalyRate)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">已完成任务</span>
              <span className="stat-card__value">{stats.completedTasks}</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">已取消任务</span>
              <span className="stat-card__value">{stats.cancelledTasks}</span>
            </div>
          </div>

          {/* Charts */}
          <div className="charts-grid">
            <div className="chart-card">
              <h3 className="chart-card__title">优先级分布</h3>
              <PriorityPieChart data={stats.priorityDistribution} />
            </div>
            <div className="chart-card">
              <h3 className="chart-card__title">设备任务分布</h3>
              <ResourceTaskBarChart data={stats.resourceTaskDistribution} />
            </div>
            <div className="chart-card chart-card--full">
              <h3 className="chart-card__title">设备利用率</h3>
              <UtilizationBarChart data={stats.resourceUtilization} />
            </div>
          </div>

          {/* Resource utilization table */}
          <div className="detail-section">
            <h3 className="detail-section__title">设备利用率明细</h3>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>设备</th>
                    <th>作业时长</th>
                    <th>在线时长</th>
                    <th>利用率</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.resourceUtilization.map((ru) => (
                    <tr key={ru.resourceId}>
                      <td>{ru.resourceName} (#{ru.resourceId})</td>
                      <td>{formatDuration(ru.busyDuration)}</td>
                      <td>{formatDuration(ru.onlineDuration)}</td>
                      <td>{formatPercent(ru.utilizationRate)}</td>
                    </tr>
                  ))}
                  {stats.resourceUtilization.length === 0 && (
                    <tr><td colSpan={4} className="empty-text">暂无数据</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
