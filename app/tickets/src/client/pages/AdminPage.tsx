import { useCallback, useEffect, useState } from 'react'
import { apiRequest, apiPost, apiDelete } from '../platform/api-client'
import { useToast } from '../hooks/useToast'
import { ErrorBanner, SkeletonRows, EmptyState, Spinner, formatDate } from '../components/common'
import type { BusinessGroup, AssignmentRule } from '../hooks/types'

type Tab = 'groups' | 'rules'

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('groups')

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">管理后台</h1>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('groups')}
          className={`px-4 py-2 text-sm rounded-lg ${
            tab === 'groups' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          业务组管理
        </button>
        <button
          onClick={() => setTab('rules')}
          className={`px-4 py-2 text-sm rounded-lg ${
            tab === 'rules' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          分配规则
        </button>
      </div>
      {tab === 'groups' ? <GroupsTab /> : <RulesTab />}
    </div>
  )
}

// --- Business Groups tab (AC-03) ---
function GroupsTab() {
  const { showToast } = useToast()
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [creating, setCreating] = useState(false)
  const [memberInputs, setMemberInputs] = useState<Record<string, string>>({})

  const fetchGroups = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiRequest<{ items: BusinessGroup[] }>('/api/business-groups')
      setGroups(res.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载业务组失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGroupName.trim()) return
    setCreating(true)
    try {
      await apiPost('/api/business-groups', { name: newGroupName.trim() })
      setNewGroupName('')
      showToast('业务组创建成功')
      fetchGroups()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '创建失败', 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleAddMember = async (groupId: string) => {
    const userId = memberInputs[groupId]?.trim()
    if (!userId) {
      showToast('请输入用户ID', 'error')
      return
    }
    try {
      await apiPost(`/api/business-groups/${groupId}/members`, { userId })
      setMemberInputs({ ...memberInputs, [groupId]: '' })
      showToast('成员添加成功')
      fetchGroups()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '添加成员失败', 'error')
    }
  }

  const handleRemoveMember = async (groupId: string, userId: string) => {
    try {
      await apiDelete(`/api/business-groups/${groupId}/members/${userId}`)
      showToast('成员已移除')
      fetchGroups()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '移除成员失败', 'error')
    }
  }

  if (error) return <ErrorBanner message={error} onRetry={fetchGroups} />
  if (loading) return <SkeletonRows count={3} />

  return (
    <div className="space-y-4">
      {/* Create group form */}
      <form onSubmit={handleCreate} className="flex gap-2 bg-white rounded-lg border border-gray-200 p-4">
        <input
          type="text"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          maxLength={100}
          placeholder="业务组名称"
          className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={creating}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-40 hover:bg-blue-700 flex items-center gap-2"
        >
          {creating && <Spinner className="w-4 h-4" />}
          创建
        </button>
      </form>

      {/* Groups list */}
      {groups.length === 0 ? (
        <EmptyState message="暂无业务组" icon="📂" />
      ) : (
        groups.map((group) => (
          <div key={group.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800">{group.name}</span>
                <span className="text-xs text-gray-400">#{group.id}</span>
                <span className="text-xs text-gray-400">· {group.members.length} 名成员</span>
              </div>
            </div>

            {/* Members */}
            <div className="px-4 py-3">
              {group.members.length === 0 ? (
                <p className="text-xs text-gray-400 mb-2">暂无成员</p>
              ) : (
                <div className="space-y-1 mb-3">
                  {group.members.map((m) => (
                    <div key={m.userId} className="flex items-center justify-between text-sm py-1">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-700">{m.userName}</span>
                        <span className="text-xs text-gray-400">({m.email})</span>
                        <span className="text-xs text-gray-400">#{m.userId}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveMember(group.id, m.userId)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        移除
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add member form */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={memberInputs[group.id] ?? ''}
                  onChange={(e) => setMemberInputs({ ...memberInputs, [group.id]: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddMember(group.id)}
                  placeholder="用户ID"
                  className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={() => handleAddMember(group.id)}
                  className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                >
                  添加成员
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// --- Assignment Rules tab (AC-04) ---
function RulesTab() {
  const { showToast } = useToast()
  const [rules, setRules] = useState<AssignmentRule[]>([])
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ category: '', groupId: '' })
  const [creating, setCreating] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [rulesRes, groupsRes] = await Promise.all([
        apiRequest<{ items: AssignmentRule[] }>('/api/assignment-rules'),
        apiRequest<{ items: BusinessGroup[] }>('/api/business-groups'),
      ])
      setRules(rulesRes.items)
      setGroups(groupsRes.items)
      if (groupsRes.items.length > 0 && !form.groupId) {
        setForm((prev) => ({ ...prev, groupId: groupsRes.items[0].id }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.category.trim() || !form.groupId) {
      showToast('请填写分类和目标业务组', 'error')
      return
    }
    setCreating(true)
    try {
      await apiPost('/api/assignment-rules', {
        category: form.category.trim(),
        groupId: form.groupId,
      })
      setForm({ category: '', groupId: form.groupId })
      showToast('规则创建成功')
      fetchAll()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '创建失败', 'error')
    } finally {
      setCreating(false)
    }
  }

  if (error) return <ErrorBanner message={error} onRetry={fetchAll} />
  if (loading) return <SkeletonRows count={3} />

  return (
    <div className="space-y-4">
      {/* Create rule form */}
      <form onSubmit={handleCreate} className="flex gap-2 bg-white rounded-lg border border-gray-200 p-4">
        <input
          type="text"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          placeholder="问题分类（如 auth）"
          className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={form.groupId}
          onChange={(e) => setForm({ ...form, groupId: e.target.value })}
          className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">选择业务组</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={creating}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-40 hover:bg-blue-700 flex items-center gap-2"
        >
          {creating && <Spinner className="w-4 h-4" />}
          创建规则
        </button>
      </form>

      {/* Rules list */}
      {rules.length === 0 ? (
        <EmptyState message="暂无分配规则" icon="📋" />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-gray-500 font-medium">分类</th>
                <th className="px-4 py-2 text-left text-gray-500 font-medium">目标业务组</th>
                <th className="px-4 py-2 text-left text-gray-500 font-medium">规则ID</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="px-4 py-2 text-gray-700">{r.category}</td>
                  <td className="px-4 py-2 text-gray-700">{r.groupName}</td>
                  <td className="px-4 py-2 text-gray-400 text-xs">#{r.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
