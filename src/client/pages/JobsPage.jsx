import { useCallback, useEffect, useState } from 'react';
import { jobsApi, taskInstancesApi, ApiError } from '../api/client.js';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useToast } from '../components/Toast.jsx';

const DAYS = [
  { val: 1, label: '周一' }, { val: 2, label: '周二' }, { val: 3, label: '周三' },
  { val: 4, label: '周四' }, { val: 5, label: '周五' }, { val: 6, label: '周六' },
  { val: 7, label: '周日' },
];

const EMPTY_FORM = { area_id: '', assignee: '', schedule_type: 'daily', schedule_days: [], start_time: '08:00' };

export default function JobsPage({ areas, onNavigateToInstances }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [instancesModal, setInstancesModal] = useState(null);
  const [instances, setInstances] = useState([]);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const { showSuccess, showError } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await jobsApi.list();
      setJobs(data);
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(job) {
    setForm({
      area_id: job.area_id,
      assignee: job.assignee,
      schedule_type: job.schedule_type,
      schedule_days: job.schedule_days || [],
      start_time: job.start_time,
    });
    setEditingId(job.id);
    setErrors({});
    setModalOpen(true);
  }

  function toggleDay(val) {
    const days = new Set(form.schedule_days);
    if (days.has(val)) days.delete(val);
    else days.add(val);
    setForm({ ...form, schedule_days: [...days].sort() });
  }

  function validate() {
    const e = {};
    if (!form.area_id) e.area_id = '请选择区域';
    if (!form.assignee.trim()) e.assignee = '请输入执行人';
    if (!form.start_time.trim()) e.start_time = '请输入起始时间';
    if (form.schedule_type === 'weekly' && (!form.schedule_days || form.schedule_days.length === 0)) {
      e.schedule_days = '周作业至少选择一天';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    const payload = {
      area_id: form.area_id,
      assignee: form.assignee,
      schedule_type: form.schedule_type,
      schedule_days: form.schedule_type === 'weekly' ? form.schedule_days : [],
      start_time: form.start_time,
    };
    try {
      if (editingId) {
        await jobsApi.update(editingId, payload);
        showSuccess('作业已更新');
      } else {
        await jobsApi.create(payload);
        showSuccess('作业已创建');
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      showError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(job) {
    try {
      await jobsApi.update(job.id, { active: false });
      showSuccess('作业已停用');
      await load();
    } catch (e) {
      showError(e.message);
    }
  }

  async function viewInstances(job) {
    setInstancesModal(job);
    setInstancesLoading(true);
    try {
      const data = await taskInstancesApi.list({ job_id: job.id });
      setInstances(data);
    } catch (e) {
      showError(e.message);
    } finally {
      setInstancesLoading(false);
    }
  }

  const columns = [
    { key: 'area_name', label: '关联区域' },
    { key: 'assignee', label: '执行人' },
    { key: 'schedule_type', label: '调度周期', render: (r) => r.schedule_type === 'daily' ? '每日' : '每周' },
    { key: 'schedule_days', label: '执行日', render: (r) => {
      if (r.schedule_type !== 'weekly' || !r.schedule_days?.length) return '—';
      return r.schedule_days.map(d => DAYS.find(x => x.val === d)?.label || d).join('、');
    }},
    { key: 'start_time', label: '起始时间' },
    { key: 'active', label: '状态', render: (r) => <StatusBadge status={r.active ? 'active' : 'resolved'} /> },
    {
      key: 'actions', label: '操作', width: '200px',
      render: (r) => (
        <div className="table-actions">
          <button className="btn btn-sm" onClick={() => openEdit(r)}>编辑</button>
          <button className="btn btn-sm" onClick={() => viewInstances(r)}>实例</button>
          {r.active && <button className="btn btn-sm btn-danger" onClick={() => handleDeactivate(r)}>停用</button>}
        </div>
      ),
    },
  ];

  return (
    <div>
      <DataTable
        columns={columns}
        rows={jobs}
        loading={loading}
        emptyMessage="暂无定时作业，点击创建添加第一个作业"
        onEmptyAction={<button className="btn btn-primary" onClick={openCreate}>创建作业</button>}
      />

      {modalOpen && (
        <Modal
          title={editingId ? '编辑作业' : '创建作业'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setModalOpen(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? '保存中...' : '保存'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">关联区域<span className="required">*</span></label>
            <select className="form-select" value={form.area_id}
              onChange={(e) => setForm({ ...form, area_id: e.target.value })}>
              <option value="">请选择区域</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {errors.area_id && <div className="form-error">{errors.area_id}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">执行人<span className="required">*</span></label>
            <input className="form-input" value={form.assignee}
              onChange={(e) => setForm({ ...form, assignee: e.target.value })}
              placeholder="如：张三" />
            {errors.assignee && <div className="form-error">{errors.assignee}</div>}
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">调度周期<span className="required">*</span></label>
              <select className="form-select" value={form.schedule_type}
                onChange={(e) => setForm({ ...form, schedule_type: e.target.value, schedule_days: [] })}>
                <option value="daily">每日</option>
                <option value="weekly">每周</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">起始时间<span className="required">*</span></label>
              <input type="time" className="form-input" value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              {errors.start_time && <div className="form-error">{errors.start_time}</div>}
            </div>
          </div>
          {form.schedule_type === 'weekly' && (
            <div className="form-group">
              <label className="form-label">执行日<span className="required">*</span></label>
              <div className="checkbox-group">
                {DAYS.map((d) => (
                  <label key={d.val} className={`checkbox-label ${form.schedule_days.includes(d.val) ? 'checked' : ''}`}>
                    <input type="checkbox" checked={form.schedule_days.includes(d.val)}
                      onChange={() => toggleDay(d.val)} />
                    {d.label}
                  </label>
                ))}
              </div>
              {errors.schedule_days && <div className="form-error">{errors.schedule_days}</div>}
            </div>
          )}
        </Modal>
      )}

      {instancesModal && (
        <Modal
          title={`任务实例 — ${instancesModal.area_name}`}
          onClose={() => setInstancesModal(null)}
        >
          {instancesLoading ? (
            <div className="skeleton">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton-row" />)}
            </div>
          ) : instances.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-text">该作业暂无任务实例</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>计划日期</th><th>状态</th><th>执行人</th></tr>
              </thead>
              <tbody>
                {instances.map((ti) => (
                  <tr key={ti.id}>
                    <td>{ti.scheduled_date}</td>
                    <td><StatusBadge status={ti.status} /></td>
                    <td>{ti.assignee}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </div>
  );
}
