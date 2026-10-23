import { useCallback, useEffect, useState } from 'react';
import { taskInstancesApi } from '../api/client.js';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useToast } from '../components/Toast.jsx';

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待处理' },
  { value: 'in_progress', label: '执行中' },
  { value: 'completed', label: '已完成' },
  { value: 'has_obstacle_completed', label: '有障碍-已完成' },
];

export default function TaskInstancesPage({ jobs }) {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jobFilter, setJobFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { showError } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = {};
      if (jobFilter) query.job_id = jobFilter;
      if (statusFilter) query.status = statusFilter;
      const data = await taskInstancesApi.list(query);
      setInstances(data);
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }, [jobFilter, statusFilter, showError]);

  useEffect(() => { load(); }, [load]);

  const columns = [
    { key: 'area_name', label: '区域名称' },
    { key: 'assignee', label: '执行人' },
    { key: 'scheduled_date', label: '计划日期' },
    { key: 'status', label: '状态', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'created_at', label: '创建时间', render: (r) => new Date(r.created_at).toLocaleString('zh-CN') },
    { key: 'updated_at', label: '更新时间', render: (r) => new Date(r.updated_at).toLocaleString('zh-CN') },
  ];

  return (
    <div>
      <div className="filter-bar">
        <div className="form-group">
          <label className="form-label">按作业筛选</label>
          <select className="form-select" value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}>
            <option value="">全部作业</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.area_name} — {j.assignee}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">按状态筛选</label>
          <select className="form-select" value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={instances}
        loading={loading}
        emptyMessage="暂无任务实例"
      />
    </div>
  );
}
