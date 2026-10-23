import { useState } from 'react';
import type { Resource } from '@/api/types';
import { Modal } from '@/components/common/Modal';
import { useToast } from '@/components/common/Toast';

export function AssignTaskModal({
  taskId,
  resources,
  onClose,
  onAssign,
}: {
  taskId: string;
  resources: Resource[];
  onClose: () => void;
  onAssign: (taskId: string, opts: { autoAssign: boolean; resourceId?: string }) => Promise<void>;
}) {
  const idleResources = resources.filter((r) => r.status === 'idle');
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  async function handleAuto() {
    setSubmitting(true);
    try {
      await onAssign(taskId, { autoAssign: true });
      toast.showSuccess('自动分配成功');
      onClose();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : '分配失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleManual() {
    if (!selectedResourceId) {
      toast.showError('请选择空闲设备');
      return;
    }
    setSubmitting(true);
    try {
      await onAssign(taskId, { autoAssign: false, resourceId: selectedResourceId });
      toast.showSuccess('手动分配成功');
      onClose();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : '分配失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={`分配任务 #${taskId}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn--primary" disabled={submitting} onClick={handleAuto}>
            自动分配
          </button>
          <button
            className="btn btn--primary"
            disabled={submitting || !selectedResourceId}
            onClick={handleManual}
          >
            手动分配
          </button>
        </>
      }
    >
      <div className="assign-section">
        <div className="assign-section__title">自动分配</div>
        <p className="assign-section__desc">系统将自动选择距离源库位最近的空闲设备。</p>
      </div>
      <div className="assign-divider" />
      <div className="assign-section">
        <div className="assign-section__title">手动分配</div>
        {idleResources.length === 0 ? (
          <p className="empty-text">当前没有空闲设备</p>
        ) : (
          <div className="radio-list">
            {idleResources.map((r) => (
              <label key={r.resourceId} className="radio-item">
                <input
                  type="radio"
                  name="resource"
                  checked={selectedResourceId === r.resourceId}
                  onChange={() => setSelectedResourceId(r.resourceId)}
                />
                <span className="radio-item__name">{r.name}</span>
                <span className="radio-item__meta">
                  #{r.resourceId} · {r.type === 'agv' ? 'AGV' : '叉车'} · 位置: {r.currentLocationCode ?? '—'}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
