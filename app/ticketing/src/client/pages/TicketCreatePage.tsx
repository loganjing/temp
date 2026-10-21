import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiRequestError, ticketApi } from '../platform/api-client'
import { PRIORITIES, type Priority, type SessionUser } from '../components/contracts'
import { Card, ErrorInline, SectionHeading, useToast } from '../components/ui'

interface Props { currentUser: SessionUser }

export default function TicketCreatePage({ currentUser }: Props) {
  const navigate = useNavigate()
  const toast = useToast()
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState<Priority>('P3')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!subject.trim() || !description.trim() || !category.trim()) { setError('请填写主题、描述与问题分类'); return }
    setBusy(true)
    try {
      const result = await ticketApi.create({
        subject: subject.trim(), description: description.trim(), category: category.trim(), priority,
      })
      toast.success(`工单 ${result.ticket.ticketNo} 已创建`)
      navigate(`/tickets/${encodeURIComponent(result.ticket.ticketNo)}`)
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : '创建失败')
      toast.error(cause instanceof ApiRequestError ? cause.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <SectionHeading title="创建工单" subtitle={`提交人：${currentUser.name} · 公司：${currentUser.company.name}`} />
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
            主题
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required placeholder="简述问题" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
            描述
            <textarea
              className="min-h-32"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              required
              placeholder="详细说明问题与复现步骤"
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              问题分类
              <input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={64} required placeholder="如 技术支持 / 财务" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              SLA 优先级
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>
          {error && <ErrorInline message={error} />}
          <div className="flex gap-2">
            <button disabled={busy}>{busy ? '提交中…' : '创建工单'}</button>
            <button type="button" className="secondary" onClick={() => navigate('/tickets')}>取消</button>
          </div>
        </form>
      </Card>
    </div>
  )
}
