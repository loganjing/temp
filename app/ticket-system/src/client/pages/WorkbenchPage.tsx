import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Empty, Input, Segmented, Select, Space, Tag, Tooltip, Typography } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { workbenchApi } from '../api/ticket-client'
import type { Ticket, TicketListQuery } from '../api/types'
import { PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL, formatDateTime } from '../constants'
import { ErrorView, LoadingView } from '../components/StateViews'

type SortKey = 'created_at' | 'sla_priority'
type OrderKey = 'asc' | 'desc'

export default function WorkbenchPage() {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('pending_processing')
  const [sort, setSort] = useState<SortKey>('created_at')
  const [order, setOrder] = useState<OrderKey>('desc')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const query: TicketListQuery = useMemo(
    () => ({ status: status ? (status as TicketListQuery['status']) : undefined, search, sort, order, limit: 100 }),
    [status, search, sort, order],
  )

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await workbenchApi.list(query)
      setTickets(result.tickets)
      setTotal(result.total)
      setSelectedId((prev) => (prev && result.tickets.some((t) => t.id === prev) ? prev : result.tickets[0]?.id ?? null))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载工作台失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [query.status, query.sort, query.order]) // eslint-disable-line react-hooks/exhaustive-deps

  const selected = tickets.find((t) => t.id === selectedId) ?? null

  if (loading && tickets.length === 0) return <LoadingView tip="加载待处理工单…" />
  if (error) return <ErrorView message={error} onRetry={load} />

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <Card
        size="small"
        style={{ flex: '1 1 56%', minWidth: 360 }}
        title={
          <Space wrap>
            <span>待处理工单（{total}）</span>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="按主题搜索"
              style={{ width: 200 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={load}
            />
            <Select
              style={{ width: 130 }}
              value={status}
              onChange={setStatus}
              options={[
                { value: '', label: '全部状态' },
                { value: 'pending_assignment', label: '待分配' },
                { value: 'pending_processing', label: '待处理' },
                { value: 'completed', label: '已完成' },
                { value: 'cancelled', label: '已取消' },
              ]}
            />
          </Space>
        }
        extra={<Space>
          <Segmented options={[{ label: '创建时间', value: 'created_at' }, { label: '优先级', value: 'sla_priority' }]} value={sort} onChange={(v) => setSort(v as SortKey)} />
          <Segmented options={[{ label: '降序', value: 'desc' }, { label: '升序', value: 'asc' }]} value={order} onChange={(v) => setOrder(v as OrderKey)} />
          <Button icon={<ReloadOutlined />} onClick={load} size="small" />
        </Space>}
      >
        {tickets.length === 0 ? (
          <Empty description="暂无待处理工单" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tickets.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                onDoubleClick={() => navigate(`/tickets/${encodeURIComponent(t.id)}`)}
                style={{
                  cursor: 'pointer',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${selectedId === t.id ? '#1677ff' : '#f0f0f0'}`,
                  background: selectedId === t.id ? '#e6f4ff' : '#fff',
                }}
              >
                <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                  <Typography.Text strong ellipsis style={{ maxWidth: 320 }}>{t.subject}</Typography.Text>
                  <Space size={4}>
                    <Tag color={STATUS_COLOR[t.status]}>{STATUS_LABEL[t.status]}</Tag>
                    <Tag color={PRIORITY_COLOR[t.slaPriority]}>{PRIORITY_LABEL[t.slaPriority]}</Tag>
                  </Space>
                </Space>
                <div style={{ marginTop: 4, color: '#8c8c8c', fontSize: 12 }}>
                  <Tooltip title={t.category}>{t.category}</Tooltip> · {t.submitterName} · {formatDateTime(t.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card size="small" style={{ flex: '1 1 44%', minWidth: 320 }} title="工单快速详情">
        {selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Typography.Title level={5} style={{ margin: 0 }}>{selected.subject}</Typography.Title>
            <Space wrap>
              <Tag color={STATUS_COLOR[selected.status]}>{STATUS_LABEL[selected.status]}</Tag>
              <Tag color={PRIORITY_COLOR[selected.slaPriority]}>{PRIORITY_LABEL[selected.slaPriority]}</Tag>
              <Tag>{selected.category}</Tag>
            </Space>
            <Typography.Paragraph type="secondary" ellipsis={{ rows: 4 }}>{selected.description}</Typography.Paragraph>
            <div style={{ fontSize: 13, color: '#595959', display: 'grid', gap: 4 }}>
              <span>提交人：{selected.submitterName}</span>
              <span>创建时间：{formatDateTime(selected.createdAt)}</span>
              <span>分配组：{selected.assignedGroupId ?? '未分配'}</span>
            </div>
            <Button type="primary" onClick={() => navigate(`/tickets/${encodeURIComponent(selected.id)}`)}>
              查看完整详情
            </Button>
          </div>
        ) : (
          <Empty description="选择左侧工单查看详情" />
        )}
      </Card>
    </div>
  )
}
