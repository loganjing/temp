/**
 * Ticket creation form: title, description, category, SLA priority.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import type { SlaPriority, Category } from '../types';
import { priorityOrder } from '../components/ui';

export function TicketCreatePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [slaPriority, setSlaPriority] = useState<SlaPriority>('P2');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    api.listCategories()
      .then((r) => setCategories(r.items))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError('请输入主题');
    if (!description.trim()) return setError('请输入描述');
    if (!categoryId) return setError('请选择分类');
    setSubmitting(true);
    try {
      await api.createTicket({
        title: title.trim(),
        description: description.trim(),
        categoryId: Number(categoryId),
        slaPriority,
      });
      navigate('/workbench');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : '创建失败，请重试',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="card">
        <div className="card-header">
          <span className="card-title">创建工单</span>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">
                主题 <span className="req">*</span>
              </label>
              <input
                className="form-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="简要描述问题"
                maxLength={200}
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                描述 <span className="req">*</span>
              </label>
              <textarea
                className="form-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="详细描述问题内容、复现步骤等"
              />
            </div>
            <div className="flex gap-16">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">
                  分类 <span className="req">*</span>
                </label>
                <select
                  className="form-select"
                  value={categoryId}
                  onChange={(e) =>
                    setCategoryId(e.target.value ? Number(e.target.value) : '')
                  }
                >
                  <option value="">请选择</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">SLA 优先级</label>
                <select
                  className="form-select"
                  value={slaPriority}
                  onChange={(e) => setSlaPriority(e.target.value as SlaPriority)}
                >
                  {priorityOrder.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error && <div className="form-error mb-16">{error}</div>}
            <div className="flex gap-8">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
              >
                {submitting ? '提交中…' : '提交工单'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => navigate('/workbench')}
              >
                取消
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
