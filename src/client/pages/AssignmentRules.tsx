/**
 * Assignment rule management: configure category → business group
 * auto-assignment rules, delete rules.
 */

import { useState, useCallback } from 'react';
import { api, ApiError } from '../api';
import { useAsync } from '../hooks';
import { useAuth } from '../auth';
import { mockCategories } from '../mock-data';
import type { AssignmentRule, Category } from '../types';
import { Skeleton, EmptyState, ErrorState, ForbiddenState } from '../components/ui';

export function AssignmentRulesPage() {
  const { hasRole } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  const loadRules = useCallback(() => api.listAssignmentRules(), [refreshKey]);
  const { data: rulesData, loading, error, retry } = useAsync(loadRules, [refreshKey]);

  const loadGroups = useCallback(() => api.listBusinessGroups(), [refreshKey]);
  const { data: groupsData } = useAsync(loadGroups, [refreshKey]);

  const [categories] = useState<Category[]>(mockCategories);
  const [categoryId, setCategoryId] = useState('');
  const [targetGroupId, setTargetGroupId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!hasRole('admin')) return <ForbiddenState message="分配规则管理仅对管理员开放" />;

  const handleCreate = async () => {
    setFormError(null);
    if (!categoryId) return setFormError('请选择分类');
    if (!targetGroupId) return setFormError('请选择目标业务组');
    setSubmitting(true);
    try {
      await api.createAssignmentRule({
        categoryId: Number(categoryId),
        targetGroupId: Number(targetGroupId),
      });
      setCategoryId('');
      setTargetGroupId('');
      refresh();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteAssignmentRule(id);
      refresh();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : '删除失败');
    }
  };

  const groups = groupsData?.items ?? [];

  return (
    <div>
      <h1 className="text-lg font-bold mb-16">分配规则管理</h1>

      {/* Create rule */}
      <div className="card mb-16">
        <div className="card-header"><span className="card-title">新建分配规则</span></div>
        <div className="card-body">
          <div className="flex gap-16 items-end">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">工单分类</label>
              <select
                className="form-select"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">请选择</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">目标业务组</label>
              <select
                className="form-select"
                value={targetGroupId}
                onChange={(e) => setTargetGroupId(e.target.value)}
              >
                <option value="">请选择</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={submitting}
            >
              {submitting ? '创建中…' : '创建规则'}
            </button>
          </div>
          {formError && <div className="form-error mt-8">{formError}</div>}
        </div>
      </div>

      {/* Rules list */}
      <div className="card">
        <div className="card-header"><span className="card-title">现有规则</span></div>
        {loading ? (
          <div className="card-body"><Skeleton lines={4} /></div>
        ) : error ? (
          <ErrorState message={error instanceof ApiError ? error.message : '加载失败'} onRetry={retry} />
        ) : !rulesData?.items || rulesData.items.length === 0 ? (
          <EmptyState title="暂无分配规则" description="创建分类→业务组的自动分配规则后，新工单将按分类自动分配" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>规则 ID</th>
                <th>分类</th>
                <th>目标业务组</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rulesData.items.map((rule: AssignmentRule) => (
                <tr key={rule.id}>
                  <td>#{rule.id}</td>
                  <td>{rule.categoryName}</td>
                  <td>{rule.targetGroupName}</td>
                  <td>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(rule.id)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
