import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Col, Empty, Input, Row, Select, Space, Table, Tooltip, Typography } from 'antd'
import type { TableProps } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TicketDetail } from '../components/TicketDetail'
import { PriorityTag, StatusTag } from '../components/TicketTags'
import { apiRequest, errorMessage, toQuery } from '../platform/api-client'
import { dayBoundary, formatDateTime, PRIORITY_OPTIONS, STATUS_OPTIONS } from '../platform/labels'
import { useSession } from '../platform/session'
import type { Category, GroupRef, PageResult, Priority, ReferenceData, TicketStatus, TicketSummary } from '../platform/types'

interface Filters {
  status: TicketStatus | 'all'
  priority?: Priority
  categoryId?: string
  groupId?: string
  companyId?: string
  from: string
  to: string
  q?: string
  sort: 'createdAt' | 'priority' | 'updatedAt'
  order: 'asc' | 'desc'
}

const PAGE_SIZE = 20
const DEFAULT_FILTERS: Filters = { status: 'pending', from: '', to: '', sort: 'createdAt', order: 'desc' }

export default function WorkbenchPage() {
  const { message } = App.useApp()
  const { user } = useSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('ticket')
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PageResult<TicketSummary>>({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [groups, setGroups] = useState<GroupRef[]>([])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const result = await apiRequest<PageResult<TicketSummary>>(`/api/tickets${toQuery({
        scope: 'workbench',
        status: [filters.status],
        priority: filters.priority,
        categoryId: filters.categoryId,
        groupId: filters.groupId,
        companyId: filters.companyId,
        from: dayBoundary(filters.from, 'start'),
        to: dayBoundary(filters.to, 'end'),
        q: filters.q,
        sort: filters.sort,
        order: filters.order,
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
      .then((reference) => {
        setCategories(reference.categories)
        setGroups(reference.groups)
      })
      .catch(() => message.error('加载筛选选项失败'))
  }, [message])

  const update = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }))
    setPage(1)
  }

  const selectTicket = (id: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('ticket', id)
    setSearchParams(next)
  }

  const clearSelection = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('ticket')
    setSearchParams(next)
  }

  const columns: TableProps<TicketSummary>['columns'] = [
    { title: '编号', dataIndex: 'code', width: 110 },
    {
      title: '主题',
      dataIndex: 'subject',
      ellipsis: true,
      render: (subject: string) => <Tooltip title={subject}>{subject}</Tooltip>,
    },
    { title: '分类', dataIndex: 'categoryName', width: 120 },
    { title: '优先级', dataIndex: 'priority', width: 100, render: (priority: Priority) => <PriorityTag priority={priority} /> },
    { title: '状态', dataIndex: 'status', width: 96, render: (status: TicketStatus) => <StatusTag status={status} /> },
    { title: '提交人', dataIndex: ['submitter', 'name'], width: 100 },
    { title: '公司', dataIndex: 'companyName', width: 140 },
    { title: '部门', dataIndex: 'department', width: 120 },
    { title: '业务组', dataIndex: ['group', 'name'], width: 130, render: (_: unknown, record) => record.group?.name ?? '未分配' },
    { title: '创建时间', dataIndex: 'createdAt', width: 160, render: (value: string) => formatDateTime(value) },
    { title: '最近更新', dataIndex: 'updatedAt', width: 160, render: (value: string) => formatDateTime(value) },
  ]

  return (
    <div className="page">
      <Card size="small" className="filter-bar workbench-filters">
        <Space wrap size="middle">
          <Select<TicketStatus | 'all'>
            value={filters.status}
            style={{ width: 120 }}
            onChange={(status) => update({ status })}
            options={[{ value: 'all', label: '全部状态' }, ...STATUS_OPTIONS]}
          />
          <Select<Priority>
            allowClear
            placeholder="全部优先级"
            style={{ width: 130 }}
            value={filters.priority}
            onChange={(priority) => update({ priority })}
            options={PRIORITY_OPTIONS}
          />
          <Select<string>
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部分类"
            style={{ width: 150 }}
            value={filters.categoryId}
            onChange={(categoryId) => update({ categoryId })}
            options={categories.map((category) => ({ value: category.id, label: category.name }))}
          />
          <Select<string>
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部业务组"
            style={{ width: 150 }}
            value={filters.groupId}
            onChange={(groupId) => update({ groupId })}
            options={groups.map((group) => ({ value: group.id, label: group.name }))}
          />
          <Select<string>
            allowClear
            placeholder="全部公司"
            style={{ width: 150 }}
            value={filters.companyId}
            onChange={(companyId) => update({ companyId })}
            options={user ? [{ value: user.companyId, label: user.companyName }] : []}
          />
          <Typography.Text type="secondary">创建时间</Typography.Text>
          <Input
            type="date"
            style={{ width: 150 }}
            value={filters.from}
            aria-label="创建时间起"
            onChange={(event) => update({ from: event.target.value })}
          />
          <Typography.Text type="secondary">至</Typography.Text>
          <Input
            type="date"
            style={{ width: 150 }}
            value={filters.to}
            aria-label="创建时间止"
            onChange={(event) => update({ to: event.target.value })}
          />
          <Input.Search
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索工单编号或主题"
            style={{ width: 240 }}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onSearch={(value) => update({ q: value.trim() || undefined })}
          />
          <Select<'createdAt' | 'priority' | 'updatedAt'>
            value={filters.sort}
            style={{ width: 150 }}
            onChange={(sort) => update({ sort })}
            options={[
              { value: 'createdAt', label: '按创建时间' },
              { value: 'priority', label: '按优先级' },
              { value: 'updatedAt', label: '按最近更新' },
            ]}
          />
          <Select<'asc' | 'desc'>
            value={filters.order}
            style={{ width: 100 }}
            onChange={(order) => update({ order })}
            options={[
              { value: 'desc', label: '降序' },
              { value: 'asc', label: '升序' },
            ]}
          />
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>刷新</Button>
        </Space>
      </Card>

      <Row gutter={16} className="workbench-body">
        <Col xs={24} xl={10}>
          <Card size="small" title="工单队列" extra={<Typography.Text type="secondary">共 {data.total} 条</Typography.Text>}>
            {error ? (
              <Alert
                type="error"
                showIcon
                message="加载队列失败"
                description={errorMessage(error)}
                action={<Button size="small" onClick={() => void load()}>重试</Button>}
              />
            ) : (
              <Table<TicketSummary>
                rowKey="id"
                size="small"
                loading={loading}
                columns={columns}
                dataSource={data.items}
                scroll={{ x: 1400 }}
                rowClassName={(record) => (record.id === selectedId ? 'ant-table-row-selected' : '')}
                onRow={(record) => ({ onClick: () => selectTicket(record.id), style: { cursor: 'pointer' } })}
                locale={{ emptyText: <Empty description="暂无符合条件的工单" /> }}
                pagination={{
                  current: page,
                  pageSize: PAGE_SIZE,
                  total: data.total,
                  size: 'small',
                  showSizeChanger: false,
                  showTotal: (total) => `共 ${total} 条`,
                  onChange: setPage,
                }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          {selectedId ? (
            <TicketDetail
              ticketId={selectedId}
              onChanged={() => void load(true)}
              onBack={clearSelection}
            />
          ) : (
            <Card className="workbench-empty">
              <Empty description="选择左侧工单查看详情" />
              <Typography.Text type="secondary">工作台仅展示当前账号可处理范围内的工单。</Typography.Text>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  )
}
