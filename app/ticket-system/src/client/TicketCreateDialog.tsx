// 新建工单对话框：主题、描述、问题分类与 SLA 优先级（P0-P4）。
import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { apiCreateTicket, apiListCategories } from './api'
import type { Category, TicketDetail } from './contracts'
import { priorities, priorityLabels } from './labels'
import { apiErrorMessage, ErrorBanner } from './shared'
import { useAuth } from './auth'

export function TicketCreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (ticket: TicketDetail) => void
}) {
  const { me } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError('')
    void apiListCategories()
      .then((result) => {
        if (!cancelled) setCategories(result)
      })
      .catch((cause) => {
        if (!cancelled) setError(apiErrorMessage(cause, '问题分类加载失败'))
      })
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  const orgMissing = !me?.org

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const ticket = await apiCreateTicket({
        subject: String(data.get('subject') ?? '').trim(),
        description: String(data.get('description') ?? '').trim(),
        categoryId: Number(data.get('categoryId')),
        priority: String(data.get('priority')) as TicketDetail['priority'],
      })
      onCreated(ticket)
    } catch (cause) {
      setError(apiErrorMessage(cause, '工单创建失败'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="新建工单">
      <section className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-lg">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-base font-semibold text-slate-900">新建工单</h2>
          <button type="button" className="btn btn-secondary h-8 px-2" aria-label="关闭" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </header>
        <form className="stack px-5 py-4" onSubmit={(event) => void submit(event)}>
          {orgMissing && <ErrorBanner message="当前账号未设置组织档案，无法创建工单；请联系公司管理员在配置中设置组织档案。" />}
          <label className="label">
            主题（1-200 字）
            <input className="input" name="subject" required minLength={1} maxLength={200} placeholder="简要描述问题" />
          </label>
          <label className="label">
            描述（1-10000 字）
            <textarea className="input min-h-32" name="description" required minLength={1} maxLength={10000} placeholder="补充问题背景、影响与期望结果" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="label">
              问题分类
              <select className="input" name="categoryId" required defaultValue="">
                <option value="" disabled>
                  请选择分类
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              SLA 优先级
              <select className="input" name="priority" required defaultValue="P2">
                {priorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {priorityLabels[priority]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && <ErrorBanner message={error} />}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || orgMissing}>
              {busy ? '提交中…' : '提交工单'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
