import { useCallback, useEffect, useState } from 'react';
import { suppliesApi, supplyAlertsApi } from '../api/client.js';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useToast } from '../components/Toast.jsx';

const EMPTY_FORM = { name: '', quantity: 0, unit: '', threshold: 0 };

export default function SuppliesPage() {
  const [supplies, setSupplies] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { showSuccess, showError } = useToast();

  const loadSupplies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await suppliesApi.list();
      setSupplies(data);
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const data = await supplyAlertsApi.list();
      setAlerts(data);
    } catch (e) {
      showError(e.message);
    } finally {
      setAlertsLoading(false);
    }
  }, [showError]);

  useEffect(() => { loadSupplies(); loadAlerts(); }, [loadSupplies, loadAlerts]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(item) {
    setForm({ name: item.name, quantity: item.quantity, unit: item.unit, threshold: item.threshold });
    setEditingId(item.id);
    setErrors({});
    setModalOpen(true);
  }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = '请输入耗材名称';
    if (form.quantity === '' || form.quantity === null || isNaN(Number(form.quantity))) e.quantity = '请输入有效库存数量';
    if (!form.unit.trim()) e.unit = '请输入单位';
    if (form.threshold === '' || form.threshold === null || isNaN(Number(form.threshold))) e.threshold = '请输入有效阈值';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    const payload = {
      name: form.name,
      quantity: Number(form.quantity),
      unit: form.unit,
      threshold: Number(form.threshold),
    };
    try {
      if (editingId) {
        await suppliesApi.update(editingId, payload);
        showSuccess('耗材已更新');
      } else {
        await suppliesApi.create(payload);
        showSuccess('耗材已创建');
      }
      setModalOpen(false);
      await Promise.all([loadSupplies(), loadAlerts()]);
    } catch (e) {
      showError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await suppliesApi.remove(deleteTarget.id);
      showSuccess('耗材已删除');
      setDeleteTarget(null);
      await loadSupplies();
    } catch (e) {
      showError(e.message);
    }
  }

  async function handleResolveAlert(alert) {
    try {
      await supplyAlertsApi.resolve(alert.id);
      showSuccess('提醒已消除');
      await loadAlerts();
      await loadSupplies();
    } catch (e) {
      showError(e.message);
    }
  }

  const supplyColumns = [
    { key: 'name', label: '耗材名称' },
    { key: 'quantity', label: '库存数量' },
    { key: 'unit', label: '单位' },
    { key: 'threshold', label: '阈值' },
    { key: 'low_stock', label: '库存状态', render: (r) =>
      <StatusBadge status={r.low_stock ? 'pending' : 'completed'} /> },
    { key: 'updated_at', label: '更新时间', render: (r) => new Date(r.updated_at).toLocaleString('zh-CN') },
    {
      key: 'actions', label: '操作', width: '140px',
      render: (r) => (
        <div className="table-actions">
          <button className="btn btn-sm" onClick={() => openEdit(r)}>编辑</button>
          <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(r)}>删除</button>
        </div>
      ),
    },
  ];

  const alertColumns = [
    { key: 'supply_item_name', label: '耗材名称' },
    { key: 'status', label: '状态', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'created_at', label: '提醒时间', render: (r) => new Date(r.created_at).toLocaleString('zh-CN') },
    {
      key: 'actions', label: '操作', width: '100px',
      render: (r) => r.status === 'active'
        ? <button className="btn btn-sm btn-primary" onClick={() => handleResolveAlert(r)}>消除</button>
        : '—',
    },
  ];

  return (
    <div>
      <div className="section-title">耗材列表</div>
      <DataTable
        columns={supplyColumns}
        rows={supplies}
        loading={loading}
        emptyMessage="暂无耗材，点击创建添加"
        onEmptyAction={<button className="btn btn-primary" onClick={openCreate}>创建耗材</button>}
      />

      <div className="section-title mt-24">库存不足提醒</div>
      <DataTable
        columns={alertColumns}
        rows={alerts}
        loading={alertsLoading}
        emptyMessage="暂无库存提醒"
      />

      {modalOpen && (
        <Modal
          title={editingId ? '编辑耗材' : '创建耗材'}
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
            <label className="form-label">耗材名称<span className="required">*</span></label>
            <input className="form-input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="如：消毒液" />
            {errors.name && <div className="form-error">{errors.name}</div>}
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">库存数量<span className="required">*</span></label>
              <input type="number" className="form-input" value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              {errors.quantity && <div className="form-error">{errors.quantity}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">单位<span className="required">*</span></label>
              <input className="form-input" value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="如：瓶" />
              {errors.unit && <div className="form-error">{errors.unit}</div>}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">最低提醒阈值<span className="required">*</span></label>
            <input type="number" className="form-input" value={form.threshold}
              onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
            {errors.threshold && <div className="form-error">{errors.threshold}</div>}
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="删除耗材"
          message={`确定要删除耗材"${deleteTarget.name}"吗？此操作不可撤销。`}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
