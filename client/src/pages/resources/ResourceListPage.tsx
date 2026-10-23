import { useCallback, useEffect, useState } from 'react';
import type { Resource, ResourceStatus, ResourceType, Location } from '@/api/types';
import * as resourceApi from '@/api/resources';
import * as locationApi from '@/api/locations';
import { LoadingSkeleton, EmptyState, ErrorState } from '@/components/common/Feedback';
import { Modal } from '@/components/common/Modal';
import { useToast } from '@/components/common/Toast';
import { formatApiError } from '@/api/client';
import { resourceStatusLabel, resourceStatusClass, resourceTypeLabel, formatDateTime } from '@/components/common/labels';

const STATUS_OPTIONS: ResourceStatus[] = ['idle', 'busy', 'offline', 'fault'];

export function ResourceListPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ResourceStatus | ''>('');

  const [showCreate, setShowCreate] = useState(false);
  const [statusUpdateTarget, setStatusUpdateTarget] = useState<{ id: string; name: string; currentStatus: ResourceStatus } | null>(null);
  const [newStatus, setNewStatus] = useState<ResourceStatus>('idle');

  const toast = useToast();

  const loadResources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await resourceApi.fetchResources(statusFilter || undefined);
      setResources(res.resources);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  useEffect(() => {
    locationApi.fetchLocations().then((l) => setLocations(l.locations)).catch(() => {});
  }, []);

  async function handleCreate(body: { name: string; type: ResourceType; initialLocationCode: string }) {
    await resourceApi.createResource(body);
    toast.showSuccess('设备创建成功');
    setShowCreate(false);
    await loadResources();
  }

  async function handleStatusUpdate() {
    if (!statusUpdateTarget) return;
    try {
      await resourceApi.updateResourceStatus(statusUpdateTarget.id, { status: newStatus });
      toast.showSuccess('设备状态已更新');
      setStatusUpdateTarget(null);
      await loadResources();
    } catch (err) {
      toast.showError(formatApiError(err));
    }
  }

  return (
    <div className="page">
      <div className="page__toolbar">
        <div className="filter-group">
          <select className="filter-control" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as ResourceStatus | ''); }}>
            <option value="">全部状态</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{resourceStatusLabel(s)}</option>
            ))}
          </select>
          <button className="btn btn--sm" onClick={loadResources}>刷新</button>
        </div>
        <button className="btn btn--primary" onClick={() => setShowCreate(true)}>
          + 创建设备
        </button>
      </div>

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={loadResources} />
      ) : resources.length === 0 ? (
        <EmptyState message="暂无设备" />
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>设备ID</th>
                <th>名称</th>
                <th>类型</th>
                <th>状态</th>
                <th>当前位置</th>
                <th>最后位置上报</th>
                <th>当前任务</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.resourceId} className={r.status === 'fault' || r.status === 'offline' ? 'row--warning' : ''}>
                  <td className="mono">#{r.resourceId}</td>
                  <td>{r.name}</td>
                  <td>{resourceTypeLabel(r.type)}</td>
                  <td><span className={`status-badge ${resourceStatusClass(r.status)}`}>{resourceStatusLabel(r.status)}</span></td>
                  <td className="mono">{r.currentLocationCode ?? '—'}</td>
                  <td className="text-sm">{formatDateTime(r.lastPositionAt)}</td>
                  <td className="mono">{r.currentTaskId ? `#${r.currentTaskId}` : '—'}</td>
                  <td>
                    <button
                      className="btn btn--sm btn--link"
                      onClick={() => {
                        setStatusUpdateTarget({ id: r.resourceId, name: r.name, currentStatus: r.status });
                        setNewStatus(r.status);
                      }}
                    >
                      更新状态
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateResourceModal
          locations={locations}
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
        />
      )}

      {statusUpdateTarget && (
        <Modal
          title={`更新设备状态 — ${statusUpdateTarget.name}`}
          onClose={() => setStatusUpdateTarget(null)}
          footer={
            <>
              <button className="btn" onClick={() => setStatusUpdateTarget(null)}>取消</button>
              <button className="btn btn--primary" onClick={handleStatusUpdate}>确认</button>
            </>
          }
        >
          <div className="form-field">
            <label className="form-label">选择新状态</label>
            <div className="radio-list">
              {STATUS_OPTIONS.map((s) => (
                <label key={s} className="radio-item">
                  <input
                    type="radio"
                    name="resource-status"
                    checked={newStatus === s}
                    onChange={() => setNewStatus(s)}
                  />
                  <span className={`status-badge ${resourceStatusClass(s)}`}>{resourceStatusLabel(s)}</span>
                </label>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CreateResourceModal({
  locations,
  onClose,
  onSubmit,
}: {
  locations: Location[];
  onClose: () => void;
  onSubmit: (body: { name: string; type: ResourceType; initialLocationCode: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ResourceType>('agv');
  const [initialLocationCode, setInitialLocationCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = '请输入设备名称';
    if (!initialLocationCode) e.initialLocationCode = '请选择初始位置';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), type, initialLocationCode });
    } catch (err) {
      toast.showError(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="创建搬运设备"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn--primary" disabled={submitting} onClick={handleSubmit}>
            {submitting ? '提交中…' : '创建'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-field">
          <label className="form-label">设备名称</label>
          <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} placeholder="请输入设备名称" />
          {errors.name && <span className="form-error">{errors.name}</span>}
        </div>
        <div className="form-field">
          <label className="form-label">设备类型</label>
          <select className="form-control" value={type} onChange={(e) => setType(e.target.value as ResourceType)}>
            <option value="agv">AGV</option>
            <option value="forklift">叉车</option>
          </select>
        </div>
        <div className="form-field form-field--full">
          <label className="form-label">初始位置</label>
          <select className="form-control" value={initialLocationCode} onChange={(e) => setInitialLocationCode(e.target.value)}>
            <option value="">请选择</option>
            {locations.map((l) => (
              <option key={l.locationCode} value={l.locationCode}>
                {l.locationCode} — {l.name}
              </option>
            ))}
          </select>
          {errors.initialLocationCode && <span className="form-error">{errors.initialLocationCode}</span>}
        </div>
      </div>
    </Modal>
  );
}
