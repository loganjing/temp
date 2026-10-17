import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Modal } from '../components/common';
import { apiErrorMessage, createTicket, listCategories } from '../api/client';
import type { Category, Priority, TicketDetail } from '../api/types';
import { PRIORITY_LABELS } from '../app/labels';

const PRIORITY_ORDER: ReadonlyArray<Priority> = ['P0', 'P1', 'P2', 'P3', 'P4'];

interface TicketCreateModalProps {
  onClose: () => void;
  onCreated: (ticket: TicketDetail) => void;
}

/** 创建工单对话框：主题 / 描述 / 分类 / P0–P4 优先级（AC-01）。 */
export function TicketCreateModal({ onClose, onCreated }: TicketCreateModalProps) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [priority, setPriority] = useState<Priority>('P2');
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [categoriesTick, setCategoriesTick] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCategories(null);
    setCategoriesError(null);
    listCategories()
      .then((list) => {
        if (cancelled) return;
        setCategories(list);
        setCategoryId((prev) => (prev !== '' && list.some((c) => c.id === prev) ? prev : list[0]?.id ?? ''));
      })
      .catch((err: unknown) => {
        if (!cancelled) setCategoriesError(apiErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [categoriesTick]);

  const submit = async () => {
    const trimmedSubject = subject.trim();
    if (trimmedSubject.length === 0) {
      setFormError('请填写工单主题');
      return;
    }
    if (categoryId === '') {
      setFormError('请选择问题分类');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const ticket = await createTicket({
        subject: trimmedSubject,
        description: description.trim(),
        categoryId,
        priority,
      });
      onCreated(ticket);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="新建工单"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void submit()}
            disabled={busy || categories === null}
          >
            <Plus size={14} />
            {busy ? '提交中…' : '创建工单'}
          </button>
        </>
      }
    >
      {categoriesError !== null && (
        <div className="error-banner" role="alert">
          <span className="error-banner-text">分类加载失败：{categoriesError}</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setCategoriesTick((n) => n + 1)}
          >
            重试
          </button>
        </div>
      )}
      <div className="form">
        <label className="form-field">
          <span className="form-label">
            主题 <em className="required">*</em>
          </span>
          <input
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="简要描述问题"
            maxLength={200}
            autoFocus
          />
        </label>
        <label className="form-field">
          <span className="form-label">描述</span>
          <textarea
            className="textarea"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="补充问题详情（可选）"
          />
        </label>
        <label className="form-field">
          <span className="form-label">
            问题分类 <em className="required">*</em>
          </span>
          <select
            className="select"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={categories === null}
          >
            <option value="">
              {categories === null ? '分类加载中…' : '请选择分类'}
            </option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-field">
          <span className="form-label">SLA 优先级</span>
          <div className="priority-picker" role="radiogroup" aria-label="SLA 优先级">
            {PRIORITY_ORDER.map((p) => (
              <button
                key={p}
                type="button"
                className={`priority-option${priority === p ? ' active' : ''}`}
                role="radio"
                aria-checked={priority === p}
                onClick={() => setPriority(p)}
              >
                {p} {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
          <span className="form-hint">默认 P2；优先级影响处理时效应由服务端语义约束。</span>
        </div>
        {formError !== null && (
          <div className="form-error" role="alert">
            {formError}
          </div>
        )}
      </div>
    </Modal>
  );
}
