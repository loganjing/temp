import { useCallback, useEffect, useState } from 'react';
import { areasApi, ApiError } from '../api/client.js';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useToast } from '../components/Toast.jsx';

const EMPTY_FORM = { name: '', location_desc: '', requirements: '' };

export default function AreasPage() {
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { showSuccess, showError } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await areasApi.list();
      setAreas(data);
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

  function openEdit(area) {
    setForm({ name: area.name, location_desc: area.location_desc, requirements: area.requirements });
    setEditingId(area.id);
    setErrors({});
    setModalOpen(true);
  }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = '请输入区域名称';
    if (!form.location_desc.trim()) e.location_desc = '请输入位置描述';
    if (!form.requirements.trim()) e.requirements = '请输入清洁要求';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (editingId) {
        await areasApi.update(editingId, form);
        showSuccess('区域已更新');
      } else {
        await areasApi.create(form);
        showSuccess('区域已创建');
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      showError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await areasApi.remove(deleteTarget.id);
      showSuccess('区域已删除');
      setDeleteTarget(null);
      await load();
    } catch (e) {
      showError(e.message);
    }
  }

  const columns = [
    { key: 'name', label: '区域名称' },
    { key: 'location_desc', label: '位置描述' },
    { key: 'requirements', label: '清洁要求' },
    { key: 'created_at', label: '创建时间', render: (r) => new Date(r.created_at).toLocaleString('zh-CN') },
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

  return (
    <div>
      <DataTable
        columns={columns}
        rows={areas}
        loading={loading}
        emptyMessage="暂无清洁区域，点击创建添加第一个区域"
        onEmptyAction={<button className="btn btn-primary" onClick={openCreate}>创建区域</button>}
      />

      {modalOpen && (
        <Modal
          title={editingId ? '编辑区域' : '创建区域'}
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
            <label className="form-label">区域名称<span className="required">*</span></label>
            <input className="form-input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="如：一楼A区" />
            {errors.name && <div className="form-error">{errors.name}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">位置描述<span className="required">*</span></label>
            <input className="form-input" value={form.location_desc}
              onChange={(e) => setForm({ ...form, location_desc: e.target.value })}
              placeholder="如：东侧入口至中庭" />
            {errors.location_desc && <div className="form-error">{errors.location_desc}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">清洁要求<span className="required">*</span></label>
            <textarea className="form-textarea" value={form.requirements}
              onChange={(e) => setForm({ ...form, requirements: e.target.value })}
              placeholder="如：每日两次，地面无水渍、垃圾桶不超过半满" />
            {errors.requirements && <div className="form-error">{errors.requirements}</div>}
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="删除区域"
          message={`确定要删除区域"${deleteTarget.name}"吗？此操作不可撤销。`}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
