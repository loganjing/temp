import { useState, useEffect, useCallback } from 'react'
import { companyApi, groupApi } from '../platform/api-client'
import type { BusinessGroup, Company, GroupMember } from '../types'
import {
  Skeleton, ErrorBanner, EmptyState, PrimaryButton,
  Modal, FormField, TextInput, formatTime,
} from '../components/ui'

export default function OrganizationManagement() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loadingCompanies, setLoadingCompanies] = useState(true)
  const [companyError, setCompanyError] = useState<string | null>(null)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)

  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [groupError, setGroupError] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  const [members, setMembers] = useState<GroupMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [memberError, setMemberError] = useState<string | null>(null)

  const [showCreateCompany, setShowCreateCompany] = useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)

  const loadCompanies = useCallback(async () => {
    setLoadingCompanies(true)
    setCompanyError(null)
    try {
      const res = await companyApi.list()
      setCompanies(res.items)
    } catch (e) {
      setCompanyError(e instanceof Error ? e.message : '加载公司列表失败')
    } finally {
      setLoadingCompanies(false)
    }
  }, [])

  const loadGroups = useCallback(async (companyId: string) => {
    setLoadingGroups(true)
    setGroupError(null)
    try {
      const res = await companyApi.getGroups(companyId)
      setGroups(res.items)
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : '加载业务组失败')
    } finally {
      setLoadingGroups(false)
    }
  }, [])

  const loadMembers = useCallback(async (groupId: string) => {
    setLoadingMembers(true)
    setMemberError(null)
    try {
      const res = await groupApi.getMembers(groupId)
      setMembers(res.items)
    } catch (e) {
      setMemberError(e instanceof Error ? e.message : '加载成员失败')
    } finally {
      setLoadingMembers(false)
    }
  }, [])

  useEffect(() => { loadCompanies() }, [loadCompanies])

  useEffect(() => {
    setSelectedGroupId(null)
    setMembers([])
    if (selectedCompanyId) loadGroups(selectedCompanyId)
    else setGroups([])
  }, [selectedCompanyId, loadGroups])

  useEffect(() => {
    if (selectedGroupId) loadMembers(selectedGroupId)
    else setMembers([])
  }, [selectedGroupId, loadMembers])

  return (
    <div className="flex h-full">
      {/* Column 1: Companies */}
      <div className="w-1/3 flex flex-col border-r border-gray-200 bg-white">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">公司</h2>
          <PrimaryButton onClick={() => setShowCreateCompany(true)}>创建公司</PrimaryButton>
        </div>
        <div className="flex-1 overflow-auto">
          {loadingCompanies ? <Skeleton lines={4} /> :
           companyError ? <ErrorBanner message={companyError} onRetry={loadCompanies} /> :
           companies.length === 0 ? <EmptyState message="暂无公司" /> :
           companies.map((c) => (
             <button
               key={c.id}
               onClick={() => setSelectedCompanyId(c.id)}
               className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${c.id === selectedCompanyId ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''}`}
             >
               <div className="text-sm font-medium text-gray-900">{c.name}</div>
               <div className="text-xs text-gray-400 mt-1">{formatTime(c.createdAt)}</div>
             </button>
           ))}
        </div>
      </div>

      {/* Column 2: Groups */}
      <div className="w-1/3 flex flex-col border-r border-gray-200 bg-white">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">业务组</h2>
          {selectedCompanyId && <PrimaryButton onClick={() => setShowCreateGroup(true)}>创建业务组</PrimaryButton>}
        </div>
        <div className="flex-1 overflow-auto">
          {!selectedCompanyId ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState message="请先选择公司" />
            </div>
          ) : loadingGroups ? <Skeleton lines={4} /> :
            groupError ? <ErrorBanner message={groupError} onRetry={() => loadGroups(selectedCompanyId)} /> :
            groups.length === 0 ? <EmptyState message="暂无业务组" /> :
            groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setSelectedGroupId(g.id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${g.id === selectedGroupId ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''}`}
              >
                <div className="text-sm font-medium text-gray-900">{g.name}</div>
                <div className="text-xs text-gray-400 mt-1">{formatTime(g.createdAt)}</div>
              </button>
            ))}
        </div>
      </div>

      {/* Column 3: Members */}
      <div className="flex-1 flex flex-col bg-white">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">成员</h2>
          {selectedGroupId && <PrimaryButton onClick={() => setShowAddMember(true)}>添加成员</PrimaryButton>}
        </div>
        <div className="flex-1 overflow-auto">
          {!selectedGroupId ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState message="请先选择业务组" />
            </div>
          ) : loadingMembers ? <Skeleton lines={4} /> :
            memberError ? <ErrorBanner message={memberError} onRetry={() => loadMembers(selectedGroupId)} /> :
            members.length === 0 ? <EmptyState message="暂无成员" /> :
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">姓名</th>
                  <th className="text-left px-4 py-2 font-medium">邮箱</th>
                  <th className="text-left px-4 py-2 font-medium">添加时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-900">{m.name}</td>
                    <td className="px-4 py-2 text-gray-600">{m.email}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs">{formatTime(m.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>}
        </div>
      </div>

      {showCreateCompany && (
        <CreateNameModal
          title="创建公司"
          label="公司名称"
          placeholder="请输入公司名称"
          onClose={() => setShowCreateCompany(false)}
          onSubmit={async (name) => { const c = await companyApi.create(name); setShowCreateCompany(false); loadCompanies(); setSelectedCompanyId(c.id) }}
        />
      )}
      {showCreateGroup && selectedCompanyId && (
        <CreateNameModal
          title="创建业务组"
          label="业务组名称"
          placeholder="请输入业务组名称"
          onClose={() => setShowCreateGroup(false)}
          onSubmit={async (name) => { await companyApi.createGroup(selectedCompanyId, name); setShowCreateGroup(false); loadGroups(selectedCompanyId) }}
        />
      )}
      {showAddMember && selectedGroupId && (
        <AddMemberModal
          onClose={() => setShowAddMember(false)}
          onSubmit={async (name, email) => { await groupApi.addMember(selectedGroupId, name, email); setShowAddMember(false); loadMembers(selectedGroupId) }}
        />
      )}
    </div>
  )
}

function CreateNameModal({ title, label, placeholder, onClose, onSubmit }: {
  title: string; label: string; placeholder: string
  onClose: () => void; onSubmit: (name: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(name)
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label={label}>
          <TextInput required value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} />
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">取消</button>
          <PrimaryButton type="submit" disabled={submitting}>{submitting ? '提交中...' : '确认'}</PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}

function AddMemberModal({ onClose, onSubmit }: {
  onClose: () => void; onSubmit: (name: string, email: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(name, email)
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="添加成员" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="姓名">
          <TextInput required value={name} onChange={(e) => setName(e.target.value)} placeholder="成员姓名" />
        </FormField>
        <FormField label="邮箱">
          <TextInput required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">取消</button>
          <PrimaryButton type="submit" disabled={submitting}>{submitting ? '提交中...' : '确认添加'}</PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
