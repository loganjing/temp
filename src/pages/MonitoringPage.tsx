import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { AlertTriangle, TrendingUp, Package, Users } from 'lucide-react';
import { TopBar } from '../components/Layout/TopBar';
import { DataTable, type Column } from '../components/Table/DataTable';
import { useToast } from '../client/context/ToastContext';
import { fetchMonitoringOverview } from '../client/api/monitoring';
import type { MonitoringOverview, InProgressTask } from '../client/types';

export function MonitoringPage() {
  const toast = useToast();
  const [overview, setOverview] = useState<MonitoringOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMonitoringOverview();
      setOverview(data);
    } catch {
      toast.error('加载进度监控数据失败');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const columns: Column<InProgressTask>[] = [
    {
      key: 'taskNo',
      header: '任务编号',
      render: (row) => <span className="cell-strong">{row.taskNo}</span>,
    },
    { key: 'plotCode', header: '地块', render: (row) => `${row.plotCode} ${row.plotName}` },
    { key: 'assignedWorker', header: '作业人员', render: (row) => row.assignedWorker },
    {
      key: 'plannedQuantity',
      header: '计划量(kg)',
      align: 'right',
      render: (row) => String(row.plannedQuantity),
    },
    {
      key: 'totalPickedQuantity',
      header: '已采量(kg)',
      align: 'right',
      render: (row) => <span className="cell-strong">{row.totalPickedQuantity}</span>,
    },
    {
      key: 'progress',
      header: '进度',
      render: (row) => {
        const pct = row.plannedQuantity > 0
          ? Math.min(100, Math.round((row.totalPickedQuantity / row.plannedQuantity) * 100))
          : 0;
        return (
          <div className="progress-bar">
            <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
            <span className="progress-bar__label">{pct}%</span>
          </div>
        );
      },
    },
    {
      key: 'priority',
      header: '优先级',
      render: (row) =>
        row.priority === '紧急' ? (
          <span className="badge badge--danger">紧急</span>
        ) : (
          <span className="badge badge--default">普通</span>
        ),
    },
    {
      key: 'hasPendingException',
      header: '异常',
      render: (row) =>
        row.hasPendingException ? (
          <span className="badge badge--danger">
            <AlertTriangle size={12} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
            待处理异常
          </span>
        ) : (
          <span className="cell-muted">—</span>
        ),
    },
  ];

  return (
    <div className="page">
      <TopBar title="作业进度监控" />
      <div className="page__body">
        {overview && overview.pendingExceptionCount > 0 && (
          <div className="alert alert--warning">
            <AlertTriangle size={20} />
            <span>
              当前有 <strong>{overview.pendingExceptionCount}</strong> 条待处理异常，请及时处理
            </span>
          </div>
        )}

        {/* KPI 卡片 */}
        <div className="kpi-grid">
          <KpiCard
            icon={<Package size={24} />}
            label="待执行任务"
            value={overview?.taskSummary.assigned ?? 0}
            color="warning"
            loading={loading}
          />
          <KpiCard
            icon={<TrendingUp size={24} />}
            label="执行中任务"
            value={overview?.taskSummary.inProgress ?? 0}
            color="info"
            loading={loading}
          />
          <KpiCard
            icon={<Package size={24} />}
            label="已完成任务"
            value={overview?.taskSummary.completed ?? 0}
            color="success"
            loading={loading}
          />
          <KpiCard
            icon={<Users size={24} />}
            label="已取消任务"
            value={overview?.taskSummary.cancelled ?? 0}
            color="default"
            loading={loading}
          />
        </div>

        <div className="card">
          <div className="card__header">
            <h3 className="card__title">进行中任务进度</h3>
          </div>
          <DataTable
            columns={columns}
            data={overview?.inProgressTasks || []}
            loading={loading}
            emptyText="当前没有进行中的任务"
          />
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  color,
  loading,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  color: 'success' | 'warning' | 'info' | 'default';
  loading: boolean;
}) {
  return (
    <div className={`kpi-card kpi-card--${color}`}>
      <div className="kpi-card__icon">{icon}</div>
      <div className="kpi-card__body">
        <span className="kpi-card__label">{label}</span>
        {loading ? (
          <div className="skeleton skeleton--lg" />
        ) : (
          <span className="kpi-card__value">{value}</span>
        )}
      </div>
    </div>
  );
}
