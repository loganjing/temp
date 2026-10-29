import { useState, useEffect, useCallback } from 'react'
import { assignmentRuleApi, companyApi } from '../platform/api-client'
import type { AssignmentRule, BusinessGroup, Company } from '../types'
import {
  Skeleton, ErrorBanner, EmptyState, PrimaryButton,
  Modal, FormField, TextInput, SelectInput, formatTime,
} from '../components/ui'

export default function AssignmentRules() {
  const [rules, setRules] = useState<AssignmentRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterCompanyId, setFilterCompanyId] = useState('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [showCreate, setShowCreate] = useState(false)

  const loadRules = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await assignmentRuleApi.list(filterCompanyId || undefined)
      setRules(res.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载规则失败')
    } finally {
      setLoading(false)
    }
  }, [filterCompanyId])

  useEffect(() => {
    companyApi.list().then((res) => setCompanies(res.items)).catch(() => {})
  }, [])

  useEffect(() => { loadRules() }, [loadRules])

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="p-6 max-w-4xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold text-gray-900">分配规则</h1>
          <PrimaryButton onClick={() => setShowCreate(true)}>创建规则</PrimaryButton>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <label className="text-sm text-gray-600">按公司筛选：</label>
          <SelectInput
            value={filterCompanyId}
            onChange={(e) => setFilterCompanyId(e.target.value)}
            className="w-48"
          >
            <option value="">全部公司</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectInput>
        </div>

        <div className="bg-white rounded-md border border-gray-200">
          {loading ? <Skeleton lines={4} /> :
           error ? <ErrorBanner message={error} onRetry={loadRules} /> :
           rules.length === 0 ? <EmptyState message="暂无分配规则" /> :
           <table className="w-full text-sm">
             <thead className="bg-gray-50 text-gray-500 text-xs">
               <tr>
                 <th className="text-left px-4 py-2 font-medium">公司</th>
                 <th className="text-left px-4 py-2 font-medium">分类</th>
                 <th className="text-left px-4 py-2 font-medium">目标业务组</th>
                 <th className="text-left px-4 py-2 font-medium">创建时间</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-gray-100">
               {rules.map((r) => (
                 <tr key={r.id} className="hover:bg-gray-50">
                   <td className="px-4 py-2 text-gray-900">{r.companyName}</td>
                   <td className="px-4 py-2 text-gray-600">{r.category}</td>
                   <td className="px-4 py-2 text-gray-600">{r.targetGroupName}</td>
                   <td className="px-4 py-2 text-gray-400 text-xs">{formatTime(r.createdAt)}</td>
                 </tr>
               ))}
             </tbody>
           </table>}
        </div>
      </div>

      {showCreate && (
        <CreateRuleModal
          companies={companies}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadRules() }}
        />
      )}
    </div>
  )
}

function CreateRuleModal({ companies, onClose, onCreated }: {
  companies: Company[]
  onClose: () => void
  onCreated: () => void
}) {
  const [companyId, setCompanyId] = useState('')
  const [category, setCategory] = useState('')
  const [targetGroupId, setTargetGroupId] = useState('')
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!companyId) { setGroups([]); setTargetGroupId(''); return }
    setLoadingGroups(true)
    companyApi.getGroups(companyId)
      .then((res) => setGroups(res.items))
      .catch(() => setGroups([]))
      .finally(() => setLoadingGroups(false))
  }, [companyId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await assignmentRuleApi.create(companyId, category, targetGroupId)
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="创建分配规则" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="适用公司">
          <SelectInput required value={companyId} onChange={(e) => { setCompanyId(e.target.value); setTargetGroupId('') }}>
            <option value="">请选择公司</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectInput>
        </FormField>
        <FormField label="匹配分类">
          <TextInput required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="如：网络故障" />
        </FormField>
        <FormField label="目标业务组">
          {loadingGroups ? (
            <p className="text-sm text-gray-400">加载中...</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-gray-400">{companyId ? '该公司下暂无业务组' : '请先选择公司'}</p>
          ) : (
            <SelectInput required value={targetGroupId} onChange={(e) => setTargetGroupId(e.target.value)}>
              <option value="">请选择业务组</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </SelectInput>
          )}
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">取消</button>
          <PrimaryButton type="submit" disabled={submitting || !companyId || !targetGroupId}>{submitting ? '提交中...' : '创建规则'}</PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
