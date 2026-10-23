/**
 * Business group management: create groups, add/remove members.
 */

import { useState, useCallback } from 'react';
import { api, ApiError } from '../api';
import { useAsync } from '../hooks';
import { useAuth } from '../auth';
import type { BusinessGroup } from '../types';
import { Skeleton, EmptyState, ErrorState, ForbiddenState } from '../components/ui';

export function BusinessGroupsPage() {
  const { hasRole } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  const loadGroups = useCallback(
    () => api.listBusinessGroups(),
    [refreshKey],
  );
  const { data, loading, error, retry } = useAsync(loadGroups, [refreshKey]);

  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [memberInput, setMemberInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [addTarget, setAddTarget] = useState<number | null>(null);
  const [addUserId, setAddUserId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  if (!hasRole('admin')) return <ForbiddenState message="业务组管理仅对管理员开放" />;

  const handleCreate = async () => {
    setFormError(null);
    if (!groupName.trim()) return setFormError('请输入业务组名称');
    const memberIds = memberInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0);
    setSubmitting(true);
    try {
      await api.createBusinessGroup({ name: groupName.trim(), memberUserIds: memberIds });
      setGroupName('');
      setMemberInput('');
      setShowCreate(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMember = async (groupId: number) => {
    setActionError(null);
    const uid = Number(addUserId);
    if (!uid || isNaN(uid)) return setActionError('请输入有效的用户 ID');
    setSubmitting(true);
    try {
      await api.addMember(groupId, { userId: uid });
      setAddUserId('');
      setAddTarget(null);
      refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveMember = async (groupId: number, userId: number) => {
    try {
      await api.removeMember(groupId, userId);
      refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : '移除失败');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-16">
        <h1 className="text-lg font-bold">业务组管理</h1>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? '取消' : '新建业务组'}
        </button>
      </div>

      {showCreate && (
        <div className="card mb-16">
          <div className="card-header"><span className="card-title">新建业务组</span></div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">业务组名称 <span className="req">*</span></label>
              <input
                className="form-input"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="如：网络运维组"
              />
            </div>
            <div className="form-group">
              <label className="form-label">成员用户 ID</label>
              <input
                className="form-input"
                value={memberInput}
                onChange={(e) => setMemberInput(e.target.value)}
                placeholder="多个 ID 用逗号分隔，如：1, 2, 3"
              />
              <div className="form-hint">仅可添加同公司用户</div>
            </div>
            {formError && <div className="form-error mb-16">{formError}</div>}
            <button className="btn btn-primary" onClick={handleCreate} disabled={submitting}>
              {submitting ? '创建中…' : '创建'}
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <div className="form-error mb-16">{actionError}</div>
      )}

      {loading ? (
        <div className="card"><div className="card-body"><Skeleton lines={4} /></div></div>
      ) : error ? (
        <ErrorState message={error instanceof ApiError ? error.message : '加载失败'} onRetry={retry} />
      ) : !data?.items || data.items.length === 0 ? (
        <EmptyState title="暂无业务组" description="点击「新建业务组」创建第一个业务组" />
      ) : (
        <div className="flex gap-16" style={{ flexWrap: 'wrap' }}>
          {data.items.map((g: BusinessGroup) => (
            <div key={g.id} className="card" style={{ width: 360 }}>
              <div className="card-header">
                <span className="card-title">{g.name}</span>
                <span className="text-sm text-secondary">ID: {g.id}</span>
              </div>
              <div className="card-body">
                <div className="text-sm text-secondary mb-8">成员（{g.members.length}）</div>
                {g.members.length === 0 ? (
                  <div className="text-sm text-secondary mb-8">暂无成员</div>
                ) : (
                  <div className="tag-group mb-16">
                    {g.members.map((m) => (
                      <span key={m.id} className="badge badge-neutral" style={{ gap: 4 }}>
                        {m.userName}
                        <button
                          style={{ marginLeft: 4, color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 14 }}
                          onClick={() => handleRemoveMember(g.id, m.userId)}
                          title="移除成员"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {addTarget === g.id ? (
                  <div className="flex gap-8">
                    <input
                      className="form-input"
                      style={{ flex: 1, minWidth: 80 }}
                      type="number"
                      value={addUserId}
                      onChange={(e) => setAddUserId(e.target.value)}
                      placeholder="用户 ID"
                    />
                    <button className="btn btn-primary btn-sm" onClick={() => handleAddMember(g.id)} disabled={submitting}>
                      添加
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => setAddTarget(null)}>
                      取消
                    </button>
                  </div>
                ) : (
                  <button className="btn btn-outline btn-sm" onClick={() => { setAddTarget(g.id); setAddUserId(''); }}>
                    添加成员
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
