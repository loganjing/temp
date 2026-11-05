import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Empty, Input, Select, Space, Table, Tooltip, Typography } from 'antd'
import type { TableProps } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SubmitTicketModal } from '../components/SubmitTicketModal'
import { PriorityTag, StatusTag } from '../components/TicketTags'
import { apiRequest, errorMessage, toQuery } from '../platform/api-client'
import { formatDateTime, PRIORITY_OPTIONS, STATUS_OPTIONS } from '../platform/labels'
import type { Category, PageResult, Priority, ReferenceData, TicketStatus, TicketSummary } from '../platform/types'

interface Filters {
  status: TicketStatus | 'all'
  priority?: Priority
  categoryId?: string
  q?: string
}

const PAGE_SIZE = 20

export default function MyTicketsPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [filters, setFilters] = useState<Filters>({ status: 'all' })
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PageResult<TicketSummary>>({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [submitOpen, setSubmitOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiRequest<PageResult<TicketSummary>>(`/api/tickets${toQuery({
        scope: 'mine',
        status: [filters.status],
        priority: filters.priority,
        categoryId: filters.categoryId,
        q: filters.q,
        page,
        pageSize: PAGE_SIZE,
      })}`)
      setData(result)
      setError(null)
    } catch (cause) {
      setError(cause)
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void apiRequest<ReferenceData>('/api/reference')
      .then((reference) => setCategories(reference.categories))
      .catch(() => message.error('加载分类失败，筛选条件中暂不可用'))
  }, [message])

  const update = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }))
    setPage(1)
  }

  const columns: TableProps<TicketSummary>['columns'] = [
    {
      title: '工单编号',
      dataIndex: 'code',
      width: 120,
      render: (code: string, record) => <Link to={`/tickets/${encodeURIComponent(record.id)}`}>{code}</Link>,
    },
    {
      title: '主题',
      dataIndex: 'subject',
      ellipsis: true,
      render: (subject: string, record) => (
        <Tooltip title={subject}>
          <Link to={`/tickets/${encodeURIComponent(record.id)}`}>{subject}</Link>
        </Tooltip>
      ),
    },
    { title: '分类', dataIndex: 'categoryName', width: 130 },
    { title: '优先级', dataIndex: 'priority', width: 110, render: (priority: TicketSummary['priority']) => <PriorityTag priority={priority} /> },
    { title: '状态', dataIndex: 'status', width: 100, render: (status: TicketSummary['status']) => <StatusTag status={status} /> },
    { title: '业务组', dataIndex: ['group', 'name'], width: 140, render: (_: unknown, record) => record.group?.name ?? '未分配' },
    { title: '创建时间', dataIndex: 'createdAt', width: 160, render: (value: string) => formatDateTime(value) },
    { title: '最近更新', dataIndex: 'updatedAt', width: 160, render: (value: string) => formatDateTime(value) },
  ]

  return (
    <div className="page">
      <Card size="small" className="filter-bar">
        <Space wrap size="middle">
          <Select<TicketStatus | 'all'>
            value={filters.status}
            style={{ width: 130 }}
            onChange={(status) => update({ status })}
            options={[{ value: 'all', label: '全部状态' }, ...STATUS_OPTIONS]}
          />
          <Select<Priority>
            allowClear
            placeholder="全部优先级"
            style={{ width: 140 }}
            value={filters.priority}
            onChange={(priority) => update({ priority })}
            options={PRIORITY_OPTIONS}
          />
          <Select<string>
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部分类"
            style={{ width: 160 }}
            value={filters.categoryId}
            onChange={(categoryId) => update({ categoryId })}
            options={categories.map((category) => ({ value: category.id, label: category.name }))}
          />
          <Input.Search
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索工单编号或主题"
            style={{ width: 260 }}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onSearch={(value) => update({ q: value.trim() || undefined })}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setSubmitOpen(true)}>提交工单</Button>
      </Card>

      {error ? (
        <Alert
          type="error"
          showIcon
          message="加载工单失败"
          description={errorMessage(error)}
          action={<Button size="small" onClick={() => void load()}>重试</Button>}
        />
      ) : (
        <Card size="small">
          <Table<TicketSummary>
            rowKey="id"
            size="middle"
            loading={loading}
            columns={columns}
            dataSource={data.items}
            scroll={{ x: 1080 }}
            locale={{
              emptyText: (
                <Empty description="暂无工单">
                  <Button type="primary" onClick={() => setSubmitOpen(true)}>提交一条工单</Button>
                </Empty>
              ),
            }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: data.total,
              showSizeChanger: false,
              showTotal: (total) => `共 ${total} 条工单`,
              onChange: setPage,
            }}
          />
          <Typography.Text type="secondary">仅展示你本人提交的工单；如需协作请在工作台处理。</Typography.Text>
        </Card>
      )}

      <SubmitTicketModal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        onSubmitted={(ticket) => {
          setSubmitOpen(false)
          navigate(`/tickets/${encodeURIComponent(ticket.id)}`)
        }}
      />
    </div>
  )
}