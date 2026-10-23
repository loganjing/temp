import { useCallback, useEffect, useState } from 'react';
import { obstaclesApi } from '../api/client.js';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useToast } from '../components/Toast.jsx';

const EMPTY_REPORT = { task_instance_id: '', description: '' };
const EMPTY_RESOLVE = { resolution_method: '', resolution_result: '' };

export default function ObstaclesPage({ taskInstances }) {
  const [obstacles, setObstacles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportForm, setReportForm] = useState(EMPTY_REPORT);
  const [reportErrors, setReportErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [resolveTarget, setResolveTarget] = useState(null);
  const [resolveForm, setResolveForm] = useState(EMPTY_RESOLVE);
  const [resolveErrors, setResolveErrors] = useState({});
  const { showSuccess, showError } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await obstaclesApi.list({ status: tab });
      setObstacles(data);
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tab, showError]);

  useEffect(() => { load(); }, [load]);

  function openReport() {
    setReportForm(EMPTY_REPORT);
    setReportErrors({});
    setReportOpen(true);
  }

  function validateReport() {
    const e = {};
    if (!reportForm.task_instance_id) e.task_instance_id = '请选择任务实例';
    if (!reportForm.description.trim()) e.description = '请输入障碍描述';
    setReportErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleReport() {
    if (!validateReport()) return;
    setSubmitting(true);
    try {
      await obstaclesApi.create(reportForm);
      showSuccess('障碍已上报');
      setReportOpen(false);
      await load();
    } catch (e) {
      showError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function openResolve(obstacle) {
    setResolveTarget(obstacle);
    setResolveForm(EMPTY_RESOLVE);
    setResolveErrors({});
  }

  function validateResolve() {
    const e = {};
    if (!resolveForm.resolution_method.trim()) e.resolution_method = '请输入处理方式';
    if (!resolveForm.resolution_result.trim()) e.resolution_result = '请输入处理结果';
    setResolveErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleResolve() {
    if (!validateResolve()) return;
    setSubmitting(true);
    try {
      await obstaclesApi.resolve(resolveTarget.id, resolveForm);
      showSuccess('障碍已标记为已处理');
      setResolveTarget(null);
      await load();
    } catch (e) {
      showError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const columns = [
    { key: 'description', label: '障碍描述' },
    { key: 'task_instance_id', label: '关联实例', render: (r) => {
      const ti = taskInstances.find((t) => t.id === r.task_instance_id);
      return ti ? `${ti.area_name} / ${ti.scheduled_date}` : r.task_instance_id.slice(0, 8);
    }},
    { key: 'reported_at', label: '上报时间', render: (r) => new Date(r.reported_at).toLocaleString('zh-CN') },
    { key: 'status', label: '状态', render: (r) => <StatusBadge status={r.status} /> },
    ...(tab === 'pending' ? [{
      key: 'actions', label: '操作', width: '120px',
      render: (r) => <button className="btn btn-sm btn-primary" onClick={() => openResolve(r)}>标记处理</button>,
    }] : [{
      key: 'resolution', label: '处理信息', render: (r) => (
        <div>
          <div>{r.resolution_method}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{r.resolution_result}</div>
        </div>
      ),
    }, {
      key: 'resolved_at', label: '处理时间', render: (r) => r.resolved_at ? new Date(r.resolved_at).toLocaleString('zh-CN') : '—',
    }]),
  ];

  return (
    <div>
      <div className="filter-bar">
        <div className="form-group">
          <label className="form-label">状态筛选</label>
          <select className="form-select" value={tab} onChange={(e) => setTab(e.target.value)}>
            <option value="pending">待处理</option>
            <option value="resolved">已处理</option>
          </select>
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={obstacles}
        loading={loading}
        emptyMessage={tab === 'pending' ? '暂无待处理障碍' : '暂无已处理障碍'}
        onEmptyAction={tab === 'pending' ? <button className="btn btn-primary" onClick={openReport}>上报障碍</button> : null}
      />

      {reportOpen && (
        <Modal
          title="上报障碍"
          onClose={() => setReportOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setReportOpen(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleReport} disabled={submitting}>
                {submitting ? '提交中...' : '提交'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">关联任务实例<span className="required">*</span></label>
            <select className="form-select" value={reportForm.task_instance_id}
              onChange={(e) => setReportForm({ ...reportForm, task_instance_id: e.target.value })}>
              <option value="">请选择任务实例</option>
              {taskInstances.map((ti) => (
                <option key={ti.id} value={ti.id}>
                  {ti.area_name} / {ti.scheduled_date} / {ti.assignee}
                </option>
              ))}
            </select>
            {reportErrors.task_instance_id && <div className="form-error">{reportErrors.task_instance_id}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">障碍描述<span className="required">*</span></label>
            <textarea className="form-textarea" value={reportForm.description}
              onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
              placeholder="如：地面有大量积水无法清洁" />
            {reportErrors.description && <div className="form-error">{reportErrors.description}</div>}
          </div>
        </Modal>
      )}

      {resolveTarget && (
        <Modal
          title="标记障碍已处理"
          onClose={() => setResolveTarget(null)}
          footer={
            <>
              <button className="btn" onClick={() => setResolveTarget(null)}>取消</button>
              <button className="btn btn-primary" onClick={handleResolve} disabled={submitting}>
                {submitting ? '提交中...' : '确认处理'}
              </button>
            </>
          }
        >
          <div className="mb-16" style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', fontSize: '13px' }}>
            障碍描述：{resolveTarget.description}
          </div>
          <div className="form-group">
            <label className="form-label">处理方式<span className="required">*</span></label>
            <input className="form-input" value={resolveForm.resolution_method}
              onChange={(e) => setResolveForm({ ...resolveForm, resolution_method: e.target.value })}
              placeholder="如：协调保洁到场排水" />
            {resolveErrors.resolution_method && <div className="form-error">{resolveErrors.resolution_method}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">处理结果<span className="required">*</span></label>
            <textarea className="form-textarea" value={resolveForm.resolution_result}
              onChange={(e) => setResolveForm({ ...resolveForm, resolution_result: e.target.value })}
              placeholder="如：积水已清除，区域恢复正常" />
            {resolveErrors.resolution_result && <div className="form-error">{resolveErrors.resolution_result}</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}
