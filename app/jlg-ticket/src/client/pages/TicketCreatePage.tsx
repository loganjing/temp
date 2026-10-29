import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Category, CreateTicketBody, Priority } from '../types'
import { PRIORITY_OPTIONS, PRIORITY_LABEL } from '../types'
import { apiGet, apiPost } from '../platform/api-client'
import { ApiRequestError } from '../platform/api-client'
import { useCurrentUser } from '../context/CurrentUser'
import { LoadingState, FeedbackBanner } from '../components/States'

export default function TicketCreatePage() {
  const navigate = useNavigate()
  const { user } = useCurrentUser()

  const [categories, setCategories] = useState<Category[]>([])
  const [catLoading, setCatLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [priority, setPriority] = useState<Priority>('P2')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiGet<{ items: Category[] }>('/api/categories')
      .then((r) => {
        if (cancelled) return
        setCategories(r.items ?? [])
        if (r.items && r.items.length > 0) setCategoryId(r.items[0].id)
      })
      .catch(() => {})
      .finally(() => !cancelled && setCatLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async () => {
    if (!user) {
      setError('请先在顶部栏设置当前身份（提交人）')
      return
    }
    if (!title.trim() || !description.trim() || !categoryId) {
      setError('请填写主题、描述并选择分类')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const body: CreateTicketBody = {
        title: title.trim(),
        description: description.trim(),
        categoryId,
        submitterId: user.id,
        priority,
      }
      const created = await apiPost<{ id: string }>('/api/tickets', body)
      navigate('/', { replace: true })
      // 通过 URL state 传递新建工单 ID，列表页可据此选中
      void created
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : '创建工单失败',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">创建工单</h2>
        <p className="mt-1 text-sm text-slate-500">填写工单信息并提交，系统将根据分类规则自动分配业务组。</p>
      </div>

      {/* 提交人信息自动填充 */}
      <div className="mb-5 rounded-lg border border-slate-100 bg-white px-4 py-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">提交人信息（自动填充）</h3>
        {user ? (
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <dt className="text-slate-400">姓名</dt>
              <dd className="font-medium text-slate-700">{user.name}</dd>
            </div>
            <div>
              <dt className="text-slate-400">邮箱</dt>
              <dd className="text-slate-600">{user.email}</dd>
            </div>
            <div>
              <dt className="text-slate-400">公司 / 部门</dt>
              <dd className="text-slate-600">
                {user.companyName ?? '—'}
                {user.department ? ` · ${user.department}` : ''}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-amber-600">请先在顶部栏设置当前身份后再创建工单。</p>
        )}
      </div>

      {/* 表单 */}
      <div className="space-y-4 rounded-lg border border-slate-100 bg-white px-4 py-5">
        <FormField label="工单主题" required>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="简要描述问题"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
          />
        </FormField>

        <FormField label="工单描述" required>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="详细描述问题内容…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="问题分类" required>
            {catLoading ? (
              <LoadingState label="加载分类…" />
            ) : (
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label="SLA 优先级" required>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        {error && <FeedbackBanner type="error" message={error} />}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            onClick={() => navigate('/')}
            className="rounded-md px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !user}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {submitting ? '提交中…' : '提交工单'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}
