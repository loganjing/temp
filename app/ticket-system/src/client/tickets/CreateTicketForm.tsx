import { useEffect, useState, type FormEvent } from 'react'
import { categoriesApi } from '../api/admin'
import { describeApiError } from '../api/errors'
import { ticketsApi } from '../api/tickets'
import type { Category, SlaPriority } from '../api/types'
import { FieldError, Loading, Notice } from '../components/ui'

const priorityOptions: SlaPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export default function CreateTicketForm({ onCreated, onCancel }: { onCreated: (id: number) => void; onCancel: () => void }) {
  const [categories, setCategories] = useState<Category[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [slaPriority, setSlaPriority] = useState<SlaPriority>('P2')
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    categoriesApi.list().then((result) => setCategories(result.items)).catch(() => undefined)
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFieldError('')
    setError('')
    if (!title.trim()) { setFieldError('请填写工单主题。'); return }
    if (!description.trim()) { setFieldError('请填写问题描述。'); return }
    if (!categoryId) { setFieldError('请选择工单分类。'); return }
    setBusy(true)
    try {
      const created = await ticketsApi.create({ title: title.trim(), description: description.trim(), categoryId: Number(categoryId), slaPriority })
      onCreated(created.id)
    } catch (cause) {
      setError(describeApiError(cause, '创建工单失败。'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="section-heading"><h2>新建工单</h2><button className="secondary" onClick={onCancel}>取消</button></div>
      <form className="stack" onSubmit={(event) => void submit(event)}>
        <label>主题<input value={title} onChange={(event) => setTitle(event.currentTarget.value)} maxLength={200} required /></label>
        <label>描述<textarea value={description} onChange={(event) => setDescription(event.currentTarget.value)} rows={6} required /></label>
        <label>分类<select value={categoryId} onChange={(event) => setCategoryId(event.currentTarget.value)} required>
          <option value="">请选择分类</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select></label>
        <label>SLA 优先级<select value={slaPriority} onChange={(event) => setSlaPriority(event.currentTarget.value as SlaPriority)}>
          {priorityOptions.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
        </select></label>
        {fieldError && <FieldError>{fieldError}</FieldError>}
        {error && <Notice tone="error">{error}</Notice>}
        <button disabled={busy}>{busy ? '提交中…' : '提交工单'}</button>
        {categories.length === 0 && <Loading label="尚未维护分类，请先在“分类管理”中添加。" />}
      </form>
    </div>
  )
}