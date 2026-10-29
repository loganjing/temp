import { useCallback, useEffect, useState } from 'react'
import type { BusinessGroup, Company, Member } from '../types'
import { apiGet, apiPost, apiDelete } from '../platform/api-client'
import { ApiRequestError } from '../platform/api-client'
import { LoadingState, EmptyState, ErrorState, FeedbackBanner } from '../components/States'

export default function BusinessGroupPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [newCompanyName, setNewCompanyName] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [addMemberId, setAddMemberId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 加载公司列表
  const fetchCompanies = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await apiGet<{ items: Company[] }>('/api/companies')
      setCompanies(r.items ?? [])
      if (!selectedCompanyId && r.items && r.items.length > 0) setSelectedCompanyId(r.items[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载公司列表失败')
    } finally {
      setLoading(false)
    }
  }, [selectedCompanyId])

  useEffect(() => {
    void fetchCompanies()
  }, [fetchCompanies])

  // 加载业务组
  const fetchGroups = useCallback(async () => {
    if (!selectedCompanyId) {
      setGroups([])
      return
    }
    try {
      const r = await apiGet<{ items: BusinessGroup[] }>(
        `/api/companies/${selectedCompanyId}/business-groups`,
      )
      setGroups(r.items ?? [])
      setSelectedGroupId((prev) =>
        prev && r.items?.some((g) => g.id === prev) ? prev : r.items?.[0]?.id ?? '',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载业务组失败')
    }
  }, [selectedCompanyId])

  useEffect(() => {
    void fetchGroups()
  }, [fetchGroups])

  // 加载成员
  const fetchMembers = useCallback(async () => {
    if (!selectedGroupId) {
      setMembers([])
      return
    }
    try {
      const r = await apiGet<{ items: Member[] }>(
        `/api/business-groups/${selectedGroupId}/members`,
      )
      setMembers(r.items ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载成员失败')
    }
  }, [selectedGroupId])

  useEffect(() => {
    void fetchMembers()
  }, [fetchMembers])

  const createCompany = async () => {
    if (!newCompanyName.trim()) return
    setSubmitting(true)
    setFeedback(null)
    try {
      await apiPost('/api/companies', { name: newCompanyName.trim() })
      setNewCompanyName('')
      setFeedback({ type: 'success', message: '公司创建成功' })
      await fetchCompanies()
    } catch (err) {
      setFeedback({ type: 'error', message: errMsg(err, '创建公司失败') })
    } finally {
      setSubmitting(false)
    }
  }

  const createGroup = async () => {
    if (!selectedCompanyId || !newGroupName.trim()) return
    setSubmitting(true)
    setFeedback(null)
    try {
      await apiPost(`/api/companies/${selectedCompanyId}/business-groups`, {
        name: newGroupName.trim(),
      })
      setNewGroupName('')
      setFeedback({ type: 'success', message: '业务组创建成功' })
      await fetchGroups()
    } catch (err) {
      setFeedback({ type: 'error', message: errMsg(err, '创建业务组失败') })
    } finally {
      setSubmitting(false)
    }
  }

  const addMember = async () => {
    if (!selectedGroupId || !addMemberId.trim()) return
    setSubmitting(true)
    setFeedback(null)
    try {
      await apiPost(`/api/business-groups/${selectedGroupId}/members`, {
        userId: addMemberId.trim(),
      })
      setAddMemberId('')
      setFeedback({ type: 'success', message: '成员添加成功' })
      await fetchMembers()
      // 刷新业务组（memberCount 变化）
      await fetchGroups()
    } catch (err) {
      setFeedback({ type: 'error', message: errMsg(err, '添加成员失败') })
    } finally {
      setSubmitting(false)
    }
  }

  const removeMember = async (userId: string) => {
    if (!selectedGroupId) return
    setFeedback(null)
    try {
      await apiDelete(`/api/business-groups/${selectedGroupId}/members/${userId}`)
      setFeedback({ type: 'success', message: '成员已移除' })
      await fetchMembers()
      await fetchGroups()
    } catch (err) {
      setFeedback({ type: 'error', message: errMsg(err, '移除成员失败') })
    }
  }

  if (loading && companies.length === 0) return <LoadingState label="加载公司列表…" />

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      {error && <ErrorState message={error} onRetry={fetchCompanies} />}
      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} />}

      {/* 公司管理 */}
      <Card title="公司">
        <div className="mb-3 flex gap-2">
          <input
            value={newCompanyName}
            onChange={(e) => setNewCompanyName(e.target.value)}
            placeholder="公司名称"
            className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
          />
          <button
            onClick={createCompany}
            disabled={submitting || !newCompanyName.trim()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            创建公司
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {companies.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setSelectedCompanyId(c.id)
                setSelectedGroupId('')
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedCompanyId === c.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </Card>

      {/* 业务组管理 */}
      <Card title="业务组">
        {selectedCompanyId ? (
          <>
            <div className="mb-3 flex gap-2">
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="业务组名称"
                className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
              />
              <button
                onClick={createGroup}
                disabled={submitting || !newGroupName.trim()}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                创建业务组
              </button>
            </div>
            {groups.length === 0 ? (
              <EmptyState title="暂无业务组" hint="为公司创建第一个业务组" />
            ) : (
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGroupId(g.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedGroupId === g.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {g.name}（{g.memberCount}）
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <EmptyState title="请先选择或创建公司" />
        )}
      </Card>

      {/* 成员管理 */}
      <Card title="成员管理">
        {selectedGroupId ? (
          <>
            <div className="mb-3 flex gap-2">
              <input
                value={addMemberId}
                onChange={(e) => setAddMemberId(e.target.value)}
                placeholder="用户 ID"
                className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
              />
              <button
                onClick={addMember}
                disabled={submitting || !addMemberId.trim()}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                添加成员
              </button>
            </div>
            {members.length === 0 ? (
              <EmptyState title="暂无成员" hint="为业务组添加成员" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-400">
                    <th className="py-2 text-left font-medium">姓名</th>
                    <th className="py-2 text-left font-medium">邮箱</th>
                    <th className="py-2 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="border-b border-slate-50">
                      <td className="py-2 text-slate-700">{m.userName}</td>
                      <td className="py-2 text-slate-500">{m.userEmail}</td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => removeMember(m.userId)}
                          className="rounded-md px-2 py-0.5 text-xs text-red-500 hover:bg-red-50"
                        >
                          移除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <EmptyState title="请先选择业务组" hint="在上方选择一个业务组后管理成员" />
        )}
      </Card>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-5 py-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3>
      {children}
    </div>
  )
}

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiRequestError) return err.message
  return err instanceof Error ? err.message : fallback
}
