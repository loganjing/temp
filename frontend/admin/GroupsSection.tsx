import { useEffect, useMemo, useState } from 'react';
import type { User } from '../api/types';
import { apiErrorMessage, createBusinessGroup, listBusinessGroups, setGroupMembers } from '../api/client';
import { useToast } from '../app/toast';
import { ErrorBanner, SkeletonRows, Spinner } from '../components/common';
import type { BusinessGroup } from '../api/types';

interface GroupsSectionProps {
  companyId: number;
  companyName: string;
  companyUsers: User[];
  isAdmin: boolean;
}

/** 业务组与成员设置（AC-04）：新增业务组、整组覆盖设置成员、配置读回。 */
export function GroupsSection({ companyId, companyName, companyUsers, isAdmin }: GroupsSectionProps) {
  const { pushToast } = useToast();
  const [groups, setGroups] = useState<BusinessGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingUserIds, setEditingUserIds] = useState<number[]>([]);
  const [savingMembers, setSavingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listBusinessGroups(companyId)
      .then((list) => {
        if (!cancelled) setGroups(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, reloadTick]);

  const reload = () => setReloadTick((n) => n + 1);

  const addGroup = async () => {
    const name = newName.trim();
    if (name.length === 0) {
      setFormError('请填写业务组名称');
      return;
    }
    setCreating(true);
    setFormError(null);
    try {
      const group = await createBusinessGroup(companyId, { name });
      pushToast('success', `业务组「${group.name}」已创建`);
      setNewName('');
      reload();
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const openEditor = (group: BusinessGroup) => {
    setEditingGroupId(group.id);
    setEditingUserIds(group.members.map((m) => m.id));
    setMembersError(null);
  };

  const toggleMember = (userId: number) => {
    setEditingUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const saveMembers = async () => {
    if (editingGroupId === null) return;
    setSavingMembers(true);
    setMembersError(null);
    try {
      const updated = await setGroupMembers(editingGroupId, { userIds: editingUserIds });
      pushToast('success', `业务组「${updated.name}」成员已更新（${updated.members.length} 名成员）`);
      setEditingGroupId(null);
      reload();
    } catch (err) {
      setMembersError(apiErrorMessage(err));
    } finally {
      setSavingMembers(false);
    }
  };

  const editingGroup = groups?.find((g) => g.id === editingGroupId) ?? null;

  return (
    <section className="admin-section">
      <h3 className="section-title">业务组与成员</h3>
      <p className="muted small">
        为 {companyName} 维护业务组与成员；处理人从业务组成员中产生，分配与转派均以业务组为单位。
      </p>
      <div className="inline-form">
        <input
          className="input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新业务组名称（如：网络组）"
          disabled={creating || !isAdmin}
          aria-label="新业务组名称"
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void addGroup()}
          disabled={creating || !isAdmin || newName.trim().length === 0}
          title={isAdmin ? undefined : '需要该公司管理员权限'}
        >
          {creating ? '创建中…' : '添加业务组'}
        </button>
      </div>
      {formError !== null && (
        <div className="form-error" role="alert">
          {formError}
        </div>
      )}
      {loading && (
        <div className="card">
          <SkeletonRows rows={3} cols={4} />
        </div>
      )}
      {error !== null && (
        <ErrorBanner message={`业务组加载失败：${error}`} onRetry={reload} />
      )}
      {groups !== null && groups.length === 0 && !loading && (
        <p className="muted small">该公司暂无业务组。</p>
      )}
      <div className="group-grid">
        {groups?.map((group) => (
          <div key={group.id} className="group-card">
            <div className="group-card-head">
              <strong>{group.name}</strong>
              <span className="muted small">{group.members.length} 名成员</span>
            </div>
            <div className="member-chips">
              {group.members.length === 0 && <span className="muted small">暂无成员</span>}
              {group.members.map((m) => (
                <span key={m.id} className="member-chip" title={`${m.name}（${m.department || '—'}）`}>
                  {m.name}
                </span>
              ))}
            </div>
            {editingGroupId === group.id && editingGroup !== null ? (
              <div className="members-editor">
                <div className="members-editor-head">
                  <span className="section-subtitle">设置成员（覆盖式保存）</span>
                  <span className="muted small">
                    已选 {editingUserIds.length} / {companyUsers.length} 名公司用户
                  </span>
                </div>
                {companyUsers.length === 0 && (
                  <p className="muted small">该公司暂无用户可选。</p>
                )}
                <div className="checkbox-grid">
                  {companyUsers.map((user) => (
                    <label key={user.id} className="checkbox-item">
                      <input
                        type="checkbox"
                        checked={editingUserIds.includes(user.id)}
                        onChange={() => toggleMember(user.id)}
                        disabled={savingMembers}
                      />
                      <span>
                        {user.name}
                        {user.department.length > 0 && (
                          <span className="muted">（{user.department}）</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
                {membersError !== null && (
                  <div className="form-error" role="alert">
                    {membersError}
                  </div>
                )}
                <div className="panel-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void saveMembers()}
                    disabled={savingMembers}
                  >
                    {savingMembers ? <Spinner size={13} /> : null}
                    {savingMembers ? '保存中…' : '保存成员'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setEditingGroupId(null)}
                    disabled={savingMembers}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => openEditor(group)}
                disabled={!isAdmin}
                title={isAdmin ? undefined : '需要该公司管理员权限'}
              >
                设置成员
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** 从用户列表聚合公司选项（value + label）。 */
export function useCompanyOptions(users: User[]): { id: number; name: string }[] {
  return useMemo(() => {
    const map = new Map<number, string>();
    for (const user of users) map.set(user.company.id, user.company.name);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [users]);
}
