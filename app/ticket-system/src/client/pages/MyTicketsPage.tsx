// 我的工单（submitter）：列表 + 创建表单（主题、描述、问题分类、SLA 优先级 P0-P4）。
// 服务端强制“本公司 + 本人提交”视图域；创建后跳转到工单详情读回完整信息（AC-01）。
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createTicket, listTickets } from '../api/tickets'
import { listCategories } from '../api/org'
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  inputClass,
  PageHeader,
  PriorityBadge,
  Spinner,
  StatusBadge,
  SuccessNote,
  TableSkeleton,
} from '../components/ui'
import { IconClipboardList, IconPlus, IconX } from '../components/icons'
import { formatDateTime } from '../contracts/labels'
import type { Priority } from '../contracts/types'
import { errorMessage, useAsync } from '../hooks/useAsync'

const PAGE_SIZE = 20
const PRIORITY_OPTIONS: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export function MyTicketsPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [priority, setPriority] = useState<Priority>('P2')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')

  const categories = useAsync(() => listCategories(), [])
  const tickets = useAsync(() => listTickets({ page, pageSize: PAGE_SIZE }), [page])

  const openForm = () => {
    setFormOpen(true)
    setFormError('')
    setNotice('')
  }

  const closeForm = () => {
    setFormOpen(false)
    setSubject('')
    setDescription('')
    setCategoryId('')
    setPriority('P2')
    setFormError('')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const category = Number(categoryId)
    if (!Number.isInteger(category) || category <= 0) {
      setFormError('请选择问题分类')
      return
    }
    setBusy(true)
    setFormError('')
    try {
      const ticket = await createTicket({
        subject: subject.trim(),
        description: description.trim(),
        categoryId: category,
        priority,
      })
      setNotice(`工单 ${ticket.ticketNo} 创建成功，正在打开详情…`)
      navigate(`/tickets/${ticket.id}`)
    } catch (cause) {
      setFormError(errorMessage(cause, '创建失败'))
    } finally {
      setBusy(false)
    }
  }

  const data = tickets.data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div>
      <PageHeader
        title="我的工单"
        description="提交并跟踪本人工单；工单归属提交人所在公司"
        actions={
          <Button onClick={openForm}>
            <IconPlus />
            新建工单
          </Button>
        }
      />

      {formOpen && (
        <Card
          title="新建工单"
          description="提交后系统将按公司分类规则自动分配业务组"
          className="mb-6"
          actions={
            <Button variant="ghost" onClick={closeForm} aria-label="收起表单">
              <IconX />
              收起
            </Button>
          }
        >
          <form onSubmit={submit} className="space-y-4">
            <Field label="主题" required hint="1-200 字">
              <input
                className={inputClass}
                required
                minLength={1}
                maxLength={200}
                value={subject}
                onChange={(event) => setSubject(event.currentTarget.value)}
                placeholder="简要描述问题"
              />
            </Field>
            <Field label="问题描述" required hint="1-5000 字">
              <textarea
                className={`${inputClass} min-h-28`}
                required
                minLength={1}
                maxLength={5000}
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
                placeholder="详细说明问题现象、影响范围与期望结果"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="问题分类" required>
                <select
                  className={inputClass}
                  required
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.currentTarget.value)}
                >
                  <option value="">请选择分类</option>
                  {categories.data?.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="SLA 优先级" required hint="P0 最高，P4 最低">
                <select
                  className={inputClass}
                  value={priority}
                  onChange={(event) => setPriority(event.currentTarget.value as Priority)}
                >
                  {PRIORITY_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <ErrorBanner message={formError || null} />
            <SuccessNote message={notice || null} />
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner /> : <IconPlus />}
              提交工单
            </Button>
          </form>
        </Card>
      )}

      <Card title={`工单列表（${data?.total ?? 0}）`} bodyClassName="pt-2">
        <ErrorBanner message={tickets.error} />
        {tickets.loading && !data ? (
          <TableSkeleton rows={6} cols={6} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<IconClipboardList className="size-5" />}
            title="还没有工单"
            description="提交第一张工单后，可以在这里跟踪处理进度、回复处理人并在完成后评价。"
            action={
              <Button onClick={openForm}>
                <IconPlus />
                新建工单
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="px-3 py-2.5 font-medium">工单号</th>
                  <th className="px-3 py-2.5 font-medium">主题</th>
                  <th className="px-3 py-2.5 font-medium">分类</th>
                  <th className="px-3 py-2.5 font-medium">优先级</th>
                  <th className="px-3 py-2.5 font-medium">状态</th>
                  <th className="px-3 py-2.5 font-medium">当前业务组</th>
                  <th className="px-3 py-2.5 font-medium">创建时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                  >
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{ticket.ticketNo}</td>
                    <td className="max-w-72 px-3 py-2.5">
                      <span className="block truncate text-slate-800" title={ticket.subject}>
                        {ticket.subject}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{ticket.categoryName}</td>
                    <td className="px-3 py-2.5">
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      <span className="block max-w-32 truncate" title={ticket.assignedGroupName ?? undefined}>
                        {ticket.assignedGroupName ?? '待分配'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-500" title={ticket.createdAt}>
                      {formatDateTime(ticket.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.pageSize && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm text-slate-500">
            <span>
              第 {data.page} / {totalPages} 页 · 共 {data.total} 条
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                上一页
              </Button>
              <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                下一页
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
