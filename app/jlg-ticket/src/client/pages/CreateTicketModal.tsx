import { useState, useEffect } from 'react'
import { companyApi, ticketApi } from '../platform/api-client'
import type { Company } from '../types'
import { Modal, FormField, TextInput, SelectInput, TextArea, PrimaryButton, PRIORITIES, PRIORITY_LABELS } from '../components/ui'

export default function CreateTicketModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (ticketId: string) => void
}) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    subject: '',
    description: '',
    category: '',
    slaPriority: 'P2',
    submitterName: '',
    submitterCompanyId: '',
    submitterDepartment: '',
    submitterEmail: '',
  })

  useEffect(() => {
    companyApi.list().then((res) => setCompanies(res.items)).catch(() => {})
  }, [])

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const ticket = await ticketApi.create(form)
      onCreated(ticket.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="创建工单" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="主题">
          <TextInput required value={form.subject} onChange={(e) => update('subject', e.target.value)} placeholder="请输入工单主题" />
        </FormField>
        <FormField label="描述">
          <TextArea required rows={3} value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="请输入工单描述" />
        </FormField>
        <div className="flex gap-3">
          <FormField label="分类">
            <TextInput required value={form.category} onChange={(e) => update('category', e.target.value)} placeholder="如：网络故障" />
          </FormField>
          <FormField label="SLA 优先级">
            <SelectInput value={form.slaPriority} onChange={(e) => update('slaPriority', e.target.value)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
            </SelectInput>
          </FormField>
        </div>
        <div className="border-t border-gray-200 pt-3 space-y-3">
          <p className="text-sm font-medium text-gray-500">提交人信息</p>
          <FormField label="提交人姓名">
            <TextInput required value={form.submitterName} onChange={(e) => update('submitterName', e.target.value)} placeholder="姓名" />
          </FormField>
          <FormField label="所属公司">
            <SelectInput
              required
              value={form.submitterCompanyId}
              onChange={(e) => update('submitterCompanyId', e.target.value)}
            >
              <option value="">请选择公司</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectInput>
          </FormField>
          <div className="flex gap-3">
            <FormField label="部门">
              <TextInput required value={form.submitterDepartment} onChange={(e) => update('submitterDepartment', e.target.value)} placeholder="部门" />
            </FormField>
            <FormField label="邮箱">
              <TextInput required type="email" value={form.submitterEmail} onChange={(e) => update('submitterEmail', e.target.value)} placeholder="email@example.com" />
            </FormField>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">取消</button>
          <PrimaryButton type="submit" disabled={submitting}>{submitting ? '提交中...' : '创建工单'}</PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
