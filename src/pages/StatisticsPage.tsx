import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { TrendingUp, CheckCircle, Users } from 'lucide-react';
import { TopBar } from '../components/Layout/TopBar';
import { FilterBar, type FilterConfig } from '../components/Filter/FilterBar';
import { DataTable, type Column } from '../components/Table/DataTable';
import { useToast } from '../client/context/ToastContext';
import { fetchStatistics } from '../client/api/statistics';
import { fetchPlots } from '../client/api/plots';
import type { StatisticsResponse, PlotStatistics, Plot } from '../client/types';

export function StatisticsPage() {
  const toast = useToast();
  const [statistics, setStatistics] = useState<StatisticsResponse | null>(null);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});

  const loadStatistics = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchStatistics({
        plotId: filterValues.plotId || undefined,
        variety: filterValues.variety || undefined,
        startDate: filterValues.startDate || undefined,
        endDate: filterValues.endDate || undefined,
      });
      setStatistics(data);
    } catch {
      toast.error('加载产量统计数据失败');
    } finally {
      setLoading(false);
    }
  }, [filterValues, toast]);

  const loadPlots = useCallback(async () => {
    try {
      const res = await fetchPlots();
      setPlots(res.items);
    } catch {
      // 非关键加载
    }
  }, []);

  useEffect(() => {
    loadStatistics();
    loadPlots();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filterConfigs: FilterConfig[] = [
    {
      name: 'plotId',
      label: '地块',
      type: 'select',
      options: plots.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` })),
    },
    {
      name: 'variety',
      label: '品种',
      type: 'select',
      options: Array.from(new Set(plots.map((p) => p.variety))).map((v) => ({
        value: v,
        label: v,
      })),
    },
    { name: 'startDate', label: '开始日期', type: 'date' },
    { name: 'endDate', label: '结束日期', type: 'date' },
  ];

  const columns: Column<PlotStatistics>[] = [
    {
      key: 'plotCode',
      header: '地块编号',
      render: (row) => <span className="cell-strong">{row.plotCode}</span>,
    },
    { key: 'plotName', header: '地块名称', render: (row) => row.plotName },
    { key: 'variety', header: '品种', render: (row) => row.variety },
    {
      key: 'totalPickedQuantity',
      header: '总采摘量(kg)',
      align: 'right',
      render: (row) => <span className="cell-strong">{row.totalPickedQuantity}</span>,
    },
    {
      key: 'completedTaskCount',
      header: '完成任务数',
      align: 'right',
      render: (row) => String(row.completedTaskCount),
    },
  ];

  return (
    <div className="page">
      <TopBar title="产量统计" />
      <div className="page__body">
        <FilterBar
          filters={filterConfigs}
          values={filterValues}
          onChange={(name, value) => setFilterValues((prev) => ({ ...prev, [name]: value }))}
          onSearch={loadStatistics}
          onReset={() => {
            setFilterValues({});
            loadStatistics();
          }}
        />

        {/* 概览卡片 */}
        <div className="stats-grid">
          <StatCard
            icon={<TrendingUp size={24} />}
            label="总采摘量"
            value={statistics?.summary.totalPickedQuantity ?? 0}
            unit="kg"
            color="success"
            loading={loading}
          />
          <StatCard
            icon={<CheckCircle size={24} />}
            label="完成任务数"
            value={statistics?.summary.completedTaskCount ?? 0}
            unit="个"
            color="info"
            loading={loading}
          />
          <StatCard
            icon={<Users size={24} />}
            label="参与作业人员"
            value={statistics?.summary.workerCount ?? 0}
            unit="人"
            color="warning"
            loading={loading}
          />
        </div>

        <div className="card">
          <div className="card__header">
            <h3 className="card__title">地块维度产量明细</h3>
          </div>
          <DataTable
            columns={columns}
            data={statistics?.byPlot || []}
            loading={loading}
            emptyText="暂无产量统计数据"
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  unit,
  color,
  loading,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  unit: string;
  color: 'success' | 'info' | 'warning';
  loading: boolean;
}) {
  return (
    <div className={`stat-card stat-card--${color}`}>
      <div className="stat-card__icon">{icon}</div>
      <div className="stat-card__body">
        <span className="stat-card__label">{label}</span>
        {loading ? (
          <div className="skeleton skeleton--lg" />
        ) : (
          <span className="stat-card__value">
            {value}
            <span className="stat-card__unit">{unit}</span>
          </span>
        )}
      </div>
    </div>
  );
}
