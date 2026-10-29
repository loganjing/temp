import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../platform/api-client'
import {
  type CategoriesResponse,
  type UserResponse,
  type TicketResponse,
  type Category,
  type UserDetail,
  type Priority,
  PRIORITY_OPTIONS,
  PRIORITY_LABELS,
} from '../platform/types'
import { useToast, ErrorBanner } from '../components/ui'

export default function CreateTicketPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [categories, setCategories] = useState<Category[]>([])
  const [submitterInfo, setSubmitterInfo] = useState<UserDetail | null>(null)
  const [submitterError, setSubmitterError] = useState<string | null>(null)

  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [priority, setPriority] = useState<Priority>('P3')
  const [submitterId, setSubmitterId] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    apiGet<CategoriesResponse>('/api/categories')
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => {})
  }, [])

  const lookupUser = async () => {
    const id = Number(submitterId)
    if (!id) {
      setSubmitterInfo(null)
      setSubmitterError(null)
      return
    }
    setSubmitterError(null)
    try {
      const data = await apiGet<UserResponse>(`/api/users/${id}`)
      setSubmitterInfo(data.user)
    } catch {
      setSubmitterInfo(null)
      setSubmitterError('未找到该用户')
    }
  }

  const handleSubmit = async () => {
    setError(null)
    if (!subject.trim()) {
      setError('请填写工单主题')
      return
    }
    if (!categoryId) {
      setError('请选择问题分类')
      return
    }
    const sid = Number(submitterId)
    if (!sid) {
      setError('请填写提交人 ID')
      return
    }
    setSubmitting(true)
    try {
      const data = await apiPost<TicketResponse>('/api/tickets', {
        subject: subject.trim(),
        description: description.trim() || undefined,
        categoryId: Number(categoryId),
        priority,
        submitterId: sid,
      })
      showToast('工单创建成功')
      navigate(`/tickets/${data.ticket.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建工单失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Top context bar */}
      <div className="border-b border-gray-200 bg-white px-6 py-3 flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-800">创建工单</h1>
      </div>

      {/* Centered form */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
            {error && <ErrorBanner message={error} />}

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                主题 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="请输入工单主题"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="请输入工单描述"
                rows={4}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Category + Priority */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  问题分类 <span className="text-red-500">*</span>
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">请选择分类</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SLA 优先级 <span className="text-red-500">*</span>
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Submitter info */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                提交人 ID <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={submitterId}
                  onChange={(e) => setSubmitterId(e.target.value)}
                  onBlur={lookupUser}
                  placeholder="输入提交人用户 ID"
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={lookupUser}
                  className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  查询
                </button>
              </div>
              {submitterError && (
                <p className="text-xs text-red-500 mt-1">{submitterError}</p>
              )}
              {submitterInfo && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm">
                  <div className="grid grid-cols-2 gap-1">
                    <span className="text-gray-400 text-xs">姓名</span>
                    <span className="text-gray-700">{submitterInfo.name}</span>
                    <span className="text-gray-400 text-xs">邮箱</span>
                    <span className="text-gray-700">{submitterInfo.email}</span>
                    <span className="text-gray-400 text-xs">公司</span>
                    <span className="text-gray-700">{submitterInfo.companyName}</span>
                    <span className="text-gray-400 text-xs">部门</span>
                    <span className="text-gray-700">{submitterInfo.department ?? '—'}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => navigate('/tickets')}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? '创建中...' : '提交工单'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
