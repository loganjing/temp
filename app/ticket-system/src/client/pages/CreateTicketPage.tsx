import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ticketApi, categoryApi } from '../api'
import type { Category } from '../types'
import { useToast } from '../hooks/useToast'
import { PRIORITY_VALUES, ErrorState } from '../components/common'

export default function CreateTicketPage() {
  const { notify } = useToast()
  const navigate = useNavigate()
  const [categories, setCategories] = useState<Category[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [catError, setCatError] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const result = await categoryApi.list()
        setCategories(result.items)
      } catch (cause) {
        setCatError(cause instanceof Error ? cause.message : '加载分类失败')
      }
    })()
  }, [])

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const body = {
      title: String(data.get('title') ?? '').trim(),
      description: String(data.get('description') ?? '').trim(),
      categoryId: String(data.get('categoryId') ?? ''),
      slaPriority: String(data.get('slaPriority')),
    }
    if (!body.title || !body.description || !body.categoryId) {
      setError('请填写所有必填字段')
      return
    }
    setBusy(true)
    setError('')
    try {
      const created = await ticketApi.create(body)
      notify(`工单 #${created.id} 创建成功`, 'success')
      form.reset()
      navigate('/workbench')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card page-card">
      <div className="section-heading"><h2>创建工单</h2></div>
      {catError && <ErrorState message={catError} />}
      <form className="stack" onSubmit={submit}>
        <label>主题<input name="title" required maxLength={200} placeholder="简述问题主题" /></label>
        <label>描述<textarea name="description" required maxLength={5000} rows={6} placeholder="详细描述问题内容" /></label>
        <label>分类
          <select name="categoryId" required defaultValue="">
            <option value="" disabled>选择分类…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>SLA 优先级
          <select name="slaPriority" required defaultValue="P2">
            {PRIORITY_VALUES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        {error && <p role="alert" className="error">{error}</p>}
        <button disabled={busy}>{busy ? '提交中…' : '提交工单'}</button>
      </form>
    </section>
  )
}
