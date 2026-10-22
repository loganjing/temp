import { useState, type FormEvent } from 'react'
import { describeError } from '../platform/api-client'
import { createTicket } from './api'
import { Notice } from '../platform/states'
import type { Priority, Ticket } from '../../shared/contracts'

const priorities: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

// 提交人新建工单：成功时把服务端返回的工单交给调用方刷新视图；失败保留已填写内容。
export function CreateTicketForm({ open, onToggle, onCreated }: { open: boolean; onToggle: () => void; onCreated: (ticket: Ticket) => void }) {
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState<Priority>('P2')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await createTicket({
        subject: subject.trim(),
        description: description.trim(),
        category: category.trim(),
        priority,
      })
      setSubject('')
      setDescription('')
      setCategory('')
      setPriority('P2')
      setNotice(`工单 ${result.ticket.ticketNo} 已创建 / Ticket created`)
      onCreated(result.ticket)
    } catch (cause) {
      setError(describeError(cause, '创建工单失败 / Could not create ticket'))
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <section className="card">
      <div className="section-heading">
        <h2>新建工单 / New ticket</h2>
        <button className="secondary" onClick={onToggle}>收起 / Collapse</button>
      </div>
      <form className="stack" onSubmit={(event) => void submit(event)}>
        <label>主题 / Subject<input name="subject" value={subject} onChange={(event) => setSubject(event.currentTarget.value)} required maxLength={200} /></label>
        <label>描述 / Description<textarea name="description" value={description} onChange={(event) => setDescription(event.currentTarget.value)} required maxLength={5000} rows={4} /></label>
        <div className="form-grid">
          <label>分类 / Category<input name="category" value={category} onChange={(event) => setCategory(event.currentTarget.value)} required maxLength={50} /></label>
          <label>优先级 / Priority
            <select name="priority" value={priority} onChange={(event) => setPriority(event.currentTarget.value as Priority)}>
              {priorities.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <Notice kind="success" text={notice} />
        <Notice kind="error" text={error} />
        <div className="row-actions row-actions--inline">
          <button disabled={busy}>{busy ? '提交中 / Working…' : '提交工单 / Submit ticket'}</button>
          <button type="button" className="secondary" onClick={onToggle}>取消 / Cancel</button>
        </div>
      </form>
    </section>
  )
}
