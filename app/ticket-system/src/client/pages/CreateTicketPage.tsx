import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createTicket } from '../api/ticket-api'
import type { Ticket, SlaPriority } from '../api/types'
import { PRIORITY_OPTIONS } from '../components/format'
import { StatusBadge, PriorityBadge } from '../components/StatusBadge'
import { ToastProvider, useToast } from '../components/Toast'

const CATEGORIES = ['网络故障', '账号问题', '硬件设备', '软件应用', '权限申请', '其他']

function CreateTicketInner() {
  const navigate = useNavigate()
  const toast = useToast()
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [priority, setPriority] = useState<SlaPriority>('P2')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<Ticket | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!subject.trim() || !description.trim()) return
    setBusy(true)
    try {
      const ticket = await createTicket({ subject: subject.trim(), description: description.trim(), category, slaPriority: priority })
      setCreated(ticket)
      toast('success', '工单创建成功')
    } catch (cause) {
      toast('error', cause instanceof Error ? cause.message : '创建工单失败')
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <div className="card form-card">
        <h2>工单已创建</h2>
        <div className="created-result">
          <div className="detail-grid">
            <div className="detail-field"><label>工单 ID</label><span>{created.id}</span></div>
            <div className="detail-field"><label>主题</label><span>{created.subject}</span></div>
            <div className="detail-field"><label>分类</label><span>{created.category}</span></div>
            <div className="detail-field"><label>SLA 优先级</label><span><PriorityBadge priority={created.slaPriority} /></span></div>
            <div className="detail-field"><label>初始状态</label><span><StatusBadge status={created.status} /></span></div>
            <div className="detail-field"><label>创建时间</label><span>{new Date(created.createdAt).toLocaleString('zh-CN')}</span></div>
          </div>
          <div className="action-group">
            <button onClick={() => navigate(`/tickets/${encodeURIComponent(created.id)}`)}>前往工作台查看</button>
            <button className="secondary" onClick={() => { setCreated(null); setSubject(''); setDescription('') }}>继续创建</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card form-card">
      <h2>创建工单</h2>
      <form className="stack" onSubmit={(e) => void submit(e)}>
        <label>主题<input value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={200} placeholder="简要描述问题" /></label>
        <label>分类
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>SLA 优先级
          <select value={priority} onChange={(e) => setPriority(e.target.value as SlaPriority)}>
            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>描述<textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={6} placeholder="详细描述问题内容" /></label>
        <button type="submit" disabled={busy}>{busy ? '提交中…' : '创建工单'}</button>
      </form>
    </div>
  )
}

export default function CreateTicketPage() {
  return (
    <ToastProvider>
      <CreateTicketInner />
    </ToastProvider>
  )
}
