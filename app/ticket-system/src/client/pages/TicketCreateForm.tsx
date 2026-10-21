import { Loader2, X } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { createTicket, listCategories } from '../api/endpoints'
import type { Category } from '../api/types'
import { InlineNotice, Spinner } from '../components/feedback'
import { TICKET_PRIORITY_OPTIONS } from '../lib/labels'

interface TicketCreateFormProps {
  open: boolean
  onClose: () => void
  onCreated: (ticketId: number) => void
}

// 创建工单对话框：主题/分类/优先级必填，描述可选（需求 §5.1.1）。
export default function TicketCreateForm({ open, onClose, onCreated }: TicketCreateFormProps) {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [categoriesError, setCategoriesError] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [priority, setPriority] = useState<string>('P2')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || categories !== null || categoriesError !== null) return
    listCategories()
      .then((result) => setCategories(result.items))
      .catch((err: unknown) => {
        setCategoriesError(err instanceof Error ? err.message : '加载问题分类失败')
      })
  }, [open, categories, categoriesError])

  if (!open) return null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    if (!subject.trim()) {
      setFormError('请填写工单主题')
      return
    }
    if (categoryId == null) {
      setFormError('请选择问题分类')
      return
    }
    setFormError(null)
    setSubmitting(true)
    try {
      const bundle = await createTicket({
        subject: subject.trim(),
        categoryId,
        priority,
        description: description.trim(),
      })
      onCreated(bundle.ticket.id)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '创建工单失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4 py-8">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">创建工单</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭创建工单"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div className="space-y-1.5">
            <label htmlFor="ticket-subject" className="text-xs font-medium text-slate-700">
              主题 <span className="text-red-500">*</span>
            </label>
            <input
              id="ticket-subject"
              type="text"
              maxLength={200}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="简要描述问题（≤200 字）"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="ticket-category" className="text-xs font-medium text-slate-700">
                问题分类 <span className="text-red-500">*</span>
              </label>
              <select
                id="ticket-category"
                value={categoryId ?? ''}
                onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : null)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">请选择分类</option>
                {(categories ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ticket-priority" className="text-xs font-medium text-slate-700">
                SLA 优先级 <span className="text-red-500">*</span>
              </label>
              <select
                id="ticket-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                {TICKET_PRIORITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                    {option === 'P0' ? '（最高）' : option === 'P4' ? '（最低）' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ticket-description" className="text-xs font-medium text-slate-700">
              问题描述
            </label>
            <textarea
              id="ticket-description"
              rows={5}
              maxLength={5000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="补充问题细节、复现步骤等（可选，≤5000 字）"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {categoriesError ? <InlineNotice kind="error">无法加载问题分类：{categoriesError}</InlineNotice> : null}
          {formError ? <InlineNotice kind="error">{formError}</InlineNotice> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              {submitting ? '提交中…' : '提交工单'}
            </button>
          </div>
          {categories === null && categoriesError === null ? (
            <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Spinner className="h-3 w-3" />
              正在加载问题分类…
            </p>
          ) : null}
        </form>
      </div>
    </div>
  )
}
