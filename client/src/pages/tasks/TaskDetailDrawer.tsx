import { useState } from 'react';
import type { TaskDetail, ExecutionEvent } from '@/api/types';
import {
  taskStatusLabel,
  taskStatusClass,
  priorityLabel,
  priorityClass,
  assignmentMethodLabel,
  formatDateTime,
  eventTypeLabel,
} from '@/components/common/labels';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/Modal';

interface TaskDetailDrawerProps {
  task: TaskDetail;
  events: ExecutionEvent[];
  loading?: boolean;
  onClose: () => void;
  onAssign: () => void;
  onCancel: (confirm: boolean) => void;
  onComplete: () => void;
  onRecover: (action: 'resume' | 'cancel') => void;
}

export function TaskDetailDrawer({
  task,
  events,
  loading,
  onClose,
  onAssign,
  onCancel,
  onComplete,
  onRecover,
}: TaskDetailDrawerProps) {
  const [confirmCancel, setConfirmCancel] = useState(false);

  const canAssign = task.status === 'pending';
  const canCancel = task.status === 'pending' || task.status === 'assigned' || task.status === 'in_transit';
  const needConfirm = task.status === 'in_transit';
  const canComplete = task.status === 'in_transit';
  const canRecover = task.status === 'error';

  return (
    <>
      <Modal title={`任务详情 #${task.taskId}`} onClose={onClose} width="720px">
        {loading ? (
          <div className="inline-loading">
            <div className="spinner spinner--sm" />
            <span>加载中…</span>
          </div>
        ) : (
          <div className="task-detail">
            <div className="detail-section">
              <div className="detail-header">
                <span className={`status-badge ${taskStatusClass(task.status)}`}>
                  {taskStatusLabel(task.status)}
                </span>
                <span className={`priority-badge ${priorityClass(task.priority)}`}>
                  {priorityLabel(task.priority)}
                </span>
              </div>
              <div className="detail-grid">
                <div className="detail-field">
                  <span className="detail-label">源库位</span>
                  <span className="detail-value">{task.sourceLocationCode}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">目标库位</span>
                  <span className="detail-value">{task.targetLocationCode}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">货物名称</span>
                  <span className="detail-value">{task.cargoName}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">货物数量</span>
                  <span className="detail-value">{task.cargoQuantity}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">创建人</span>
                  <span className="detail-value">{task.createdBy}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">创建时间</span>
                  <span className="detail-value">{formatDateTime(task.createdAt)}</span>
                </div>
                {task.assignedResourceId && (
                  <>
                    <div className="detail-field">
                      <span className="detail-label">分配设备</span>
                      <span className="detail-value">#{task.assignedResourceId}</span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-label">分配方式</span>
                      <span className="detail-value">{assignmentMethodLabel(task.assignmentMethod)}</span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-label">分配时间</span>
                      <span className="detail-value">{formatDateTime(task.assignedAt)}</span>
                    </div>
                  </>
                )}
                {task.remark && (
                  <div className="detail-field detail-field--full">
                    <span className="detail-label">备注</span>
                    <span className="detail-value">{task.remark}</span>
                  </div>
                )}
                {task.cancelledBy && (
                  <>
                    <div className="detail-field">
                      <span className="detail-label">取消人</span>
                      <span className="detail-value">{task.cancelledBy}</span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-label">取消时间</span>
                      <span className="detail-value">{formatDateTime(task.cancelledAt)}</span>
                    </div>
                  </>
                )}
                {task.completedAt && (
                  <div className="detail-field">
                    <span className="detail-label">完成时间</span>
                    <span className="detail-value">{formatDateTime(task.completedAt)}</span>
                  </div>
                )}
              </div>
            </div>

            {task.currentRoute && (
              <div className="detail-section">
                <h4 className="detail-section__title">当前路径</h4>
                <div className="route-info">
                  <span>预计距离: {task.currentRoute.plannedDistance.toFixed(1)} 米</span>
                  <span>预计时长: {task.currentRoute.plannedDuration} 秒</span>
                  {task.currentRoute.replanReason && (
                    <span className="route-replan">重规划原因: {task.currentRoute.replanReason}</span>
                  )}
                </div>
                <div className="route-nodes">
                  {task.currentRoute.nodes.map((node, i) => (
                    <span key={i} className="route-node">
                      {node.code}
                      {i < task.currentRoute!.nodes.length - 1 && <span className="route-arrow">→</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="detail-section">
              <h4 className="detail-section__title">执行事件时间线</h4>
              {events.length === 0 ? (
                <p className="empty-text">暂无执行事件</p>
              ) : (
                <div className="timeline">
                  {events.map((ev) => (
                    <div key={ev.eventId} className="timeline-item">
                      <div className="timeline-dot" />
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span className="timeline-type">{eventTypeLabel(ev.eventType)}</span>
                          <span className="timeline-time">{formatDateTime(ev.occurredAt)}</span>
                        </div>
                        {ev.description && <p className="timeline-desc">{ev.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="detail-actions">
              {canAssign && (
                <button className="btn btn--primary" onClick={onAssign}>
                  分配任务
                </button>
              )}
              {canCancel && (
                <button className="btn btn--danger" onClick={() => (needConfirm ? setConfirmCancel(true) : onCancel(false))}>
                  {needConfirm ? '取消任务（需确认）' : '取消任务'}
                </button>
              )}
              {canComplete && (
                <button className="btn btn--success" onClick={onComplete}>
                  确认完成
                </button>
              )}
              {canRecover && (
                <>
                  <button className="btn btn--primary" onClick={() => onRecover('resume')}>
                    恢复执行
                  </button>
                  <button className="btn btn--danger" onClick={() => onRecover('cancel')}>
                    取消任务
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {confirmCancel && (
        <ConfirmDialog
          title="确认取消搬运中任务"
          message="该任务正在搬运中，取消后设备将恢复空闲，且任务不可恢复。确认取消吗？"
          confirmText="确认取消"
          danger
          onConfirm={() => {
            setConfirmCancel(false);
            onCancel(true);
          }}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </>
  );
}
