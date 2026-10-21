import { ChevronDown, ChevronRight, Mail, Search } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { listMailOutbox } from '../api/endpoints'
import type { MailOutboxResult } from '../api/types'
import { MailKindBadge, MailStatusBadge } from '../components/badges'
import { EmptyState, ErrorBanner, InlineNotice, SkeletonList } from '../components/feedback'
import { PageHeader } from '../components/layout'
import { Pagination } from '../components/Pagination'
import { formatDateTime } from '../lib/labels'

const PAGE_SIZE = 20

// 邮件记录页：分页查询本公司的系统邮件发送记录（工单完成通知）。
export default function MailOutboxPage() {
  const [result, setResult] = useState<MailOutboxResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [ticketIdInput, setTicketIdInput] = useState('')
  const [ticketIdFilter, setTicketIdFilter] = useState<number | null>(null)
  const [filterError, setFilterError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const reload = useCallback(
    (nextPage: number, ticketId: number | null) => {
      setLoading(true)
      setError(null)
      listMailOutbox({
        page: nextPage,
        pageSize: PAGE_SIZE,
        ticketId: ticketId ?? undefined,
      })
        .then((response) => {
          setResult(response)
          setPage(nextPage)
        })
        .catch((err: unknown) => {
          setResult(null)
          setError(err instanceof Error ? err.message : '加载邮件记录失败')
        })
        .finally(() => setLoading(false))
    },
    [],
  )

  useEffect(() => {
    reload(page, ticketIdFilter)
  }, [refreshKey])

  const applyFilter = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = ticketIdInput.trim()
    if (trimmed === '') {
      setFilterError(null)
      setTicketIdFilter(null)
      setExpandedId(null)
      setPage(1)
      setRefreshKey((key) => key + 1)
      return
    }
    if (!/^\d+$/.test(trimmed)) {
      setFilterError('工单 ID 仅支持正整数（可在工单详情 URL 或编号处查看）')
      return
    }
    setFilterError(null)
    setTicketIdFilter(Number(trimmed))
    setExpandedId(null)
    setPage(1)
    setRefreshKey((key) => key + 1)
  }

  const handlePageChange = (nextPage: number) => {
    reload(nextPage, ticketIdFilter)
  }

  const items = result?.items ?? []

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="邮件记录" subtitle="系统邮件发送记录（当前公司）；工单完成通知在完成时写入" />
      <div className="mx-auto max-w-5xl space-y-4 px-6 py-5">
        <form onSubmit={applyFilter} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label htmlFor="mail-ticket-id" className="text-xs font-medium text-slate-700">
              按工单 ID 过滤
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
              <input
                id="mail-ticket-id"
                type="text"
                inputMode="numeric"
                value={ticketIdInput}
                onChange={(event) => setTicketIdInput(event.target.value)}
                placeholder="输入工单 ID（留空查看全部）"
                className="w-56 rounded-md border border-slate-300 py-2 pl-8 pr-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
          >
            应用过滤
          </button>
          {ticketIdFilter !== null ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700">
              工单 ID：{ticketIdFilter}
              <button
                type="button"
                onClick={() => {
                  setTicketIdInput('')
                  setTicketIdFilter(null)
                  setPage(1)
                  setRefreshKey((key) => key + 1)
                }}
                className="rounded-full p-0.5 hover:bg-indigo-100"
                aria-label="清除工单过滤"
              >
                ×
              </button>
            </span>
          ) : null}
        </form>
        {filterError ? <InlineNotice kind="error">{filterError}</InlineNotice> : null}

        <div className="rounded-lg border border-slate-200 bg-white">
          {loading && error === null ? (
            <SkeletonList rows={4} />
          ) : error !== null ? (
            <ErrorBanner
              message={error}
              retrying={loading}
              onRetry={() => setRefreshKey((key) => key + 1)}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="暂无邮件记录"
              hint={
                ticketIdFilter !== null
                  ? `没有工单 ID ${ticketIdFilter} 的邮件记录。`
                  : '工单完成处理后，完成通知会自动写入发送记录。'
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th scope="col" className="w-8 px-3 py-2.5" />
                  <th scope="col" className="px-3 py-2.5 font-medium">关联工单</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">类型</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">收件人</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">主题</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">状态</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">发送时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <MailRow
                    key={item.id}
                    item={item}
                    expanded={expandedId === item.id}
                    onToggle={() => setExpandedId((previous) => (previous === item.id ? null : item.id))}
                  />
                ))}
              </tbody>
            </table>
          )}
          {result !== null ? (
            <Pagination
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              onChange={handlePageChange}
              disabled={loading}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function MailRow({
  item,
  expanded,
  onToggle,
}: {
  item: MailOutboxResult['items'][number]
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className="align-top hover:bg-slate-50/60">
        <td className="px-3 py-2.5">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? '收起邮件正文' : '展开邮件正文'}
            className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            {expanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
          </button>
        </td>
        <td className="px-3 py-2.5">
          <span className="font-mono text-xs text-slate-500">{item.ticketNo}</span>
        </td>
        <td className="px-3 py-2.5">
          <MailKindBadge kind={item.kind} />
        </td>
        <td className="px-3 py-2.5">
          <span className="text-xs text-slate-600" title={item.toEmail}>
            {item.toEmail}
          </span>
        </td>
        <td className="max-w-[280px] px-3 py-2.5">
          <span className="block truncate text-xs text-slate-700" title={item.subject}>
            {item.subject}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <MailStatusBadge status={item.status} />
        </td>
        <td className="px-3 py-2.5 text-xs text-slate-500">{formatDateTime(item.createdAt)}</td>
      </tr>
      {expanded ? (
        <tr className="bg-slate-50/70">
          <td />
          <td colSpan={6} className="px-3 pb-3.5">
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">邮件正文</p>
              <p className="mt-1.5 whitespace-pre-wrap text-xs leading-6 text-slate-700">{item.body}</p>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}
