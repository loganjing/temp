import { useCallback, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createTicket, dispatchTicket } from '../api/tickets'
import { listCategories } from '../api/admin'
import { useResource } from '../hooks/useResource'
import { PRIORITY_LABELS, PRIORITY_OPTIONS, STATUS_LABELS } from '../domain/labels'
import { ErrorBanner, buttonPrimaryClass, buttonSecondaryClass, inputClass } from '../components/feedback'
import { toUserMessage } from '../platform/api-client'
import type { Priority } from '../platform/types'

export default function TicketCreatePage() {
  const navigate = useNavigate()
  // useResource 以 loader 引用为重载依赖，必须传稳定回调，否则会形成无限请求循环。
  const loadCategories = useCallback(() => listCategories(), [])
  const categories = useResource(loadCategories, '分类清单加载失败')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState<Priority>('P2')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!category) {
      setError('请选择问题分类')
      return
    }
    setBusy(true)
    try {
      const created = await createTicket({
        subject: subject.trim(),
        description: description.trim(),
        category,
        priority,
      })
      // 契约约定：创建仅落库为「已创建」，前端随后调用 dispatch 进入分配流程。
      try {
        await dispatchTicket(created.ticket.id)
      } catch (dispatchCause) {
        navigate(`/mine?ticket=${created.ticket.id}`, { replace: true })
        throw new Error(`工单已创建（${created.ticket.ticketNo}），但进入分配流程失败：${toUserMessage(dispatchCause, '分配失败')}`)
      }
      navigate(`/mine?ticket=${created.ticket.id}`, { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : toUserMessage(cause, '创建失败，请稍后重试'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">创建工单</h1>
          <p className="mt-1 text-sm text-slate-500">提交后系统将按公司「分类→业务组」规则自动分配。</p>
        </div>
        <Link to="/mine" className={buttonSecondaryClass}>
          返回我的工单
        </Link>
      </div>

      {categories.error && <ErrorBanner message={`分类清单加载失败：${categories.error}`} />}

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <form className="space-y-5" onSubmit={(event) => void submit(event)}>
          <label className="block text-sm text-slate-600">
            主题 <span className="text-red-500">*</span>
            <input
              className={`${inputClass} mt-1.5`}
              value={subject}
              required
              maxLength={200}
              placeholder="简要描述问题（不超过 200 字符）"
              onChange={(event) => setSubject(event.currentTarget.value)}
            />
          </label>
          <label className="block text-sm text-slate-600">
            描述 <span className="text-red-500">*</span>
            <textarea
              className={`${inputClass} mt-1.5 min-h-32`}
              value={description}
              required
              maxLength={5000}
              placeholder="补充问题背景、影响范围与复现步骤（不超过 5000 字符）"
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm text-slate-600">
              问题分类 <span className="text-red-500">*</span>
              <select
                className={`${inputClass} mt-1.5`}
                value={category}
                required
                disabled={categories.loading || (categories.data?.items.length ?? 0) === 0}
                onChange={(event) => setCategory(event.currentTarget.value)}
              >
                <option value="">{categories.loading ? '分类加载中…' : categories.data?.items.length === 0 ? '暂无可选分类' : '请选择分类'}</option>
                {categories.data?.items.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-600">
              SLA 优先级 <span className="text-red-500">*</span>
              <select
                className={`${inputClass} mt-1.5`}
                value={priority}
                onChange={(event) => setPriority(event.currentTarget.value as Priority)}
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {PRIORITY_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-slate-400">
            提交人姓名、邮箱、公司、部门将随工单记录；创建时间为系统记录。初始状态「{STATUS_LABELS.created}」，提交后自动进入分配流程。
          </p>
          {error && <ErrorBanner message={error} />}
          <div className="flex items-center gap-3">
            <button type="submit" className={buttonPrimaryClass} disabled={busy}>
              {busy ? '提交中…' : '提交工单'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
