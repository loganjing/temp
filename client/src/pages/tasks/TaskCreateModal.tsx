import { useState, type ReactNode } from 'react';
import type { Location, Priority } from '@/api/types';
import { priorityLabel } from '@/components/common/labels';
import { Modal } from '@/components/common/Modal';
import { useToast } from '@/components/common/Toast';

interface TaskCreateFormState {
  sourceLocationCode: string;
  targetLocationCode: string;
  cargoName: string;
  cargoQuantity: string;
  priority: Priority;
  remark: string;
  createdBy: string;
  autoAssign: boolean;
}

const initialState: TaskCreateFormState = {
  sourceLocationCode: '',
  targetLocationCode: '',
  cargoName: '',
  cargoQuantity: '1',
  priority: 'normal',
  remark: '',
  createdBy: '调度员',
  autoAssign: false,
};

export function TaskCreateModal({
  locations,
  onClose,
  onSubmit,
}: {
  locations: Location[];
  onClose: () => void;
  onSubmit: (form: TaskCreateFormState) => Promise<void>;
}) {
  const [form, setForm] = useState<TaskCreateFormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.sourceLocationCode) e.sourceLocationCode = '请选择源库位';
    if (!form.targetLocationCode) e.targetLocationCode = '请选择目标库位';
    if (form.sourceLocationCode && form.targetLocationCode && form.sourceLocationCode === form.targetLocationCode) {
      e.targetLocationCode = '源库位和目标库位不能相同';
    }
    if (!form.cargoName.trim()) e.cargoName = '请输入货物名称';
    const qty = Number(form.cargoQuantity);
    if (!form.cargoQuantity || isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
      e.cargoQuantity = '货物数量须为正整数';
    }
    if (!form.createdBy.trim()) e.createdBy = '请输入创建人';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit(form);
      toast.showSuccess('任务创建成功');
      setForm(initialState);
      onClose();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  }

  function setField<K extends keyof TaskCreateFormState>(key: K, value: TaskCreateFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const field = (label: string, children: ReactNode, error?: string) => (
    <div className="form-field">
      <label className="form-label">{label}</label>
      {children}
      {error && <span className="form-error">{error}</span>}
    </div>
  );

  return (
    <Modal
      title="创建搬运任务"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn--primary" disabled={submitting} onClick={handleSubmit}>
            {submitting ? '提交中…' : '创建任务'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {field('源库位', (
          <select
            className="form-control"
            value={form.sourceLocationCode}
            onChange={(e) => setField('sourceLocationCode', e.target.value)}
          >
            <option value="">请选择</option>
            {locations.map((l) => (
              <option key={l.locationCode} value={l.locationCode}>
                {l.locationCode} — {l.name}
              </option>
            ))}
          </select>
        ), errors.sourceLocationCode)}

        {field('目标库位', (
          <select
            className="form-control"
            value={form.targetLocationCode}
            onChange={(e) => setField('targetLocationCode', e.target.value)}
          >
            <option value="">请选择</option>
            {locations.map((l) => (
              <option key={l.locationCode} value={l.locationCode}>
                {l.locationCode} — {l.name}
              </option>
            ))}
          </select>
        ), errors.targetLocationCode)}

        {field('货物名称', (
          <input
            className="form-control"
            value={form.cargoName}
            onChange={(e) => setField('cargoName', e.target.value)}
            placeholder="请输入货物名称"
          />
        ), errors.cargoName)}

        {field('货物数量', (
          <input
            className="form-control"
            type="number"
            min={1}
            step={1}
            value={form.cargoQuantity}
            onChange={(e) => setField('cargoQuantity', e.target.value)}
          />
        ), errors.cargoQuantity)}

        {field('优先级', (
          <select
            className="form-control"
            value={form.priority}
            onChange={(e) => setField('priority', e.target.value as Priority)}
          >
            <option value="normal">{priorityLabel('normal')}</option>
            <option value="urgent">{priorityLabel('urgent')}</option>
            <option value="highest">{priorityLabel('highest')}</option>
          </select>
        ))}

        {field('备注', (
          <input
            className="form-control"
            value={form.remark}
            onChange={(e) => setField('remark', e.target.value)}
            placeholder="补充说明（可选）"
          />
        ))}

        {field('创建人', (
          <input
            className="form-control"
            value={form.createdBy}
            onChange={(e) => setField('createdBy', e.target.value)}
          />
        ), errors.createdBy)}

        <div className="form-field form-field--checkbox">
          <label>
            <input
              type="checkbox"
              checked={form.autoAssign}
              onChange={(e) => setField('autoAssign', e.target.checked)}
            />
            自动分配空闲设备
          </label>
        </div>
      </div>
    </Modal>
  );
}

export type { TaskCreateFormState };
