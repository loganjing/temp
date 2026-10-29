import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost, apiDelete } from '../platform/api-client'
import {
  type CompaniesResponse,
  type GroupsResponse,
  type MembersResponse,
  type Company,
  type BusinessGroup,
  type GroupMember,
} from '../platform/types'
import {
  SectionTitle,
  ErrorBanner,
  EmptyState,
  Spinner,
  useToast,
} from '../components/ui'
import { PlusIcon, TrashIcon } from '../components/icons'

export default function BusinessGroupPage() {
  const { showToast } = useToast()

  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null)
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newCompanyName, setNewCompanyName] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [newMemberUserId, setNewMemberUserId] = useState('')

  const [submitting, setSubmitting] = useState(false)

  const fetchCompanies = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet<CompaniesResponse>('/api/companies')
      setCompanies(data.companies ?? [])
      if (data.companies?.length && !selectedCompanyId) {
        setSelectedCompanyId(data.companies[0].id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载公司列表失败')
    } finally {
      setLoading(false)
    }
  }, [selectedCompanyId])

  const fetchGroups = useCallback(async () => {
    if (!selectedCompanyId) {
      setGroups([])
      return
    }
    try {
      const data = await apiGet<GroupsResponse>(
        `/api/companies/${selectedCompanyId}/business-groups`,
      )
      setGroups(data.groups ?? [])
      if (data.groups?.length && !selectedGroupId) {
        setSelectedGroupId(data.groups[0].id)
      } else if (!data.groups?.length) {
        setSelectedGroupId(null)
      }
    } catch {
      setGroups([])
    }
  }, [selectedCompanyId, selectedGroupId])

  const fetchMembers = useCallback(async () => {
    if (!selectedGroupId) {
      setMembers([])
      return
    }
    try {
      const data = await apiGet<MembersResponse>(`/api/business-groups/${selectedGroupId}/members`)
      setMembers(data.members ?? [])
    } catch {
      setMembers([])
    }
  }, [selectedGroupId])

  useEffect(() => {
    fetchCompanies()
  }, [fetchCompanies])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim()) return
    setSubmitting(true)
    try {
      await apiPost('/api/companies', { name: newCompanyName.trim() })
      showToast('公司已创建')
      setNewCompanyName('')
      fetchCompanies()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '创建公司失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateGroup = async () => {
    if (!selectedCompanyId || !newGroupName.trim()) return
    setSubmitting(true)
    try {
      await apiPost(`/api/companies/${selectedCompanyId}/business-groups`, {
        name: newGroupName.trim(),
      })
      showToast('业务组已创建')
      setNewGroupName('')
      fetchGroups()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '创建业务组失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddMember = async () => {
    if (!selectedGroupId || !newMemberUserId) return
    setSubmitting(true)
    try {
      await apiPost(`/api/business-groups/${selectedGroupId}/members`, {
        userId: Number(newMemberUserId),
      })
      showToast('成员已添加')
      setNewMemberUserId('')
      fetchMembers()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '添加成员失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemoveMember = async (userId: number) => {
    if (!selectedGroupId) return
    try {
      await apiDelete(`/api/business-groups/${selectedGroupId}/members/${userId}`)
      showToast('成员已移除')
      fetchMembers()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '移除成员失败', 'error')
    }
  }

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId)
  const selectedGroup = groups.find((g) => g.id === selectedGroupId)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Top context bar */}
      <div className="border-b border-gray-200 bg-white px-6 py-3 flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-800">业务组管理</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <Spinner />
        </div>
      ) : error ? (
        <div className="p-6">
          <ErrorBanner message={error} onRetry={fetchCompanies} />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: company list */}
          <div className="w-72 border-r border-gray-200 flex flex-col overflow-hidden bg-white flex-shrink-0">
            <div className="p-3 border-b border-gray-200">
              <SectionTitle>公司</SectionTitle>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="公司名称"
                  className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5"
                />
                <button
                  onClick={handleCreateCompany}
                  disabled={submitting || !newCompanyName.trim()}
                  className="flex items-center px-2 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            <ul className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {companies.length === 0 ? (
                <EmptyState title="暂无公司" description="先创建一个公司" />
              ) : (
                companies.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => {
                        setSelectedCompanyId(c.id)
                        setSelectedGroupId(null)
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors ${
                        c.id === selectedCompanyId
                          ? 'bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-500'
                          : ''
                      }`}
                    >
                      {c.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          {/* Right: groups + members */}
          <div className="flex-1 overflow-y-auto bg-gray-50">
            {!selectedCompany ? (
              <EmptyState title="请选择公司" />
            ) : (
              <div className="p-6 space-y-6 max-w-3xl">
                {/* Groups section */}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <SectionTitle>{selectedCompany.name} — 业务组</SectionTitle>
                  <div className="flex gap-1 mb-3">
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="业务组名称"
                      className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5"
                    />
                    <button
                      onClick={handleCreateGroup}
                      disabled={submitting || !newGroupName.trim()}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      <PlusIcon className="w-4 h-4" />
                      创建
                    </button>
                  </div>
                  {groups.length === 0 ? (
                    <p className="text-sm text-gray-400">暂无业务组</p>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {groups.map((g) => (
                        <li key={g.id}>
                          <button
                            onClick={() => setSelectedGroupId(g.id)}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors rounded ${
                              g.id === selectedGroupId
                                ? 'bg-blue-50 text-blue-700 font-medium'
                                : ''
                            }`}
                          >
                            {g.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Members section */}
                {selectedGroup && (
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <SectionTitle>{selectedGroup.name} — 成员</SectionTitle>
                    <div className="flex gap-1 mb-3">
                      <input
                        type="number"
                        value={newMemberUserId}
                        onChange={(e) => setNewMemberUserId(e.target.value)}
                        placeholder="用户 ID"
                        className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5"
                      />
                      <button
                        onClick={handleAddMember}
                        disabled={submitting || !newMemberUserId}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        <PlusIcon className="w-4 h-4" />
                        添加
                      </button>
                    </div>
                    {members.length === 0 ? (
                      <p className="text-sm text-gray-400">暂无成员</p>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {members.map((m) => (
                          <li
                            key={m.id}
                            className="flex items-center justify-between px-3 py-2 text-sm"
                          >
                            <div>
                              <span className="text-gray-700">{m.userName}</span>
                              <span className="text-gray-400 text-xs ml-2">{m.userEmail}</span>
                            </div>
                            <button
                              onClick={() => handleRemoveMember(m.userId)}
                              className="text-red-400 hover:text-red-600 p-1"
                              title="移除成员"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
