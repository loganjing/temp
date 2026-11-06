import { useCallback, useEffect, useState } from 'react'
import { ConfigProvider, Table, Descriptions, Button, Tag, Spin, Empty, message, Layout, Menu } from 'antd'
import { CheckOutlined, CloseOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { apiRequest, ApiRequestError } from '../platform/api-client'

type VisitorStatus = 'pending' | 'approved' | 'rejected'

type Visitor = {
  id: number
  name: string
  phone: string
  idCard: string
  company: string
  visitReason: string
  hostPerson: string
  expectedArrivalTime: string
  licensePlate: string | null
  status: VisitorStatus
  createdAt: string
  updatedAt: string
  reviewedAt: string | null
}

type VisitorListResponse = {
  items: Visitor[]
  total: number
  page: number
  limit: number
}

const STATUS_META: Record<VisitorStatus, { label: string; color: string }> = {
  pending: { label: '待审核', color: 'orange' },
  approved: { label: '已通过', color: 'green' },
  rejected: { label: '已拒绝', color: 'red' },
}

const CATEGORIES: { key: VisitorStatus; label: string }[] = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
]

const formatDate = (value: string | null): string => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN')
}

export default function AdminConsole() {
  const [category, setCategory] = useState<VisitorStatus>('pending')
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<Visitor | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')

  const loadList = useCallback(async (status: VisitorStatus) => {
    setLoading(true)
    setError('')
    try {
      const data = await apiRequest<VisitorListResponse>(`/api/visitors?status=${status}`)
      setVisitors(data.items ?? [])
      setSelectedId(null)
      setDetail(null)
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : '加载列表失败'
      setError(msg)
      setVisitors([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList(category)
  }, [category, loadList])

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true)
    try {
      const data = await apiRequest<Visitor>(`/api/visitors/${id}`)
      setDetail(data)
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : '加载详情失败'
      void message.error(msg)
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId !== null) void loadDetail(selectedId)
  }, [selectedId, loadDetail])

  const handleApprove = async () => {
    if (detail === null) return
    await updateStatus(detail.id, 'approved')
  }
  const handleReject = async () => {
    if (detail === null) return
    await updateStatus(detail.id, 'rejected')
  }

  const updateStatus = async (id: number, status: Exclude<VisitorStatus, 'pending'>) => {
    if (actionLoading || detail === null) return
    setActionLoading(true)
    try {
      const updated = await apiRequest<Visitor>(`/api/visitors/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setDetail(updated)
      void message.success(`已${STATUS_META[status].label}`)
      await loadList(category)
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : '审批操作失败'
      void message.error(msg)
    } finally {
      setActionLoading(false)
    }
  }

  const columns: ColumnsType<Visitor> = [
    { title: '姓名', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: '公司', dataIndex: 'company', key: 'company', ellipsis: true },
    { title: '被访人', dataIndex: 'hostPerson', key: 'hostPerson', ellipsis: true },
    {
      title: '预计到访',
      dataIndex: 'expectedArrivalTime',
      key: 'expectedArrivalTime',
      render: (value: string) => formatDate(value),
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (value: VisitorStatus) => <Tag color={STATUS_META[value].color}>{STATUS_META[value].label}</Tag>,
    },
  ]

  return (
    <ConfigProvider>
      <Layout className="min-h-screen">
        <Layout.Sider width={220} theme="dark" breakpoint="lg" collapsedWidth={0}>
          <div className="flex h-16 items-center justify-center text-white">
            <span className="text-base font-semibold">访客审批控制台</span>
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[category]}
            items={CATEGORIES.map((c) => ({ key: c.key, label: c.label }))}
            onClick={({ key }) => setCategory(key as VisitorStatus)}
          />
        </Layout.Sider>
        <Layout>
          <Layout.Header className="flex items-center bg-white px-6" style={{ borderBottom: '1px solid #f0f0f0' }}>
            <span className="text-base font-medium text-gray-800">{STATUS_META[category].label}</span>
            <Tag color={STATUS_META[category].color} className="ml-3">
              {visitors.length} 条
            </Tag>
          </Layout.Header>
          <Layout.Content className="p-6">
            <div className="grid h-full gap-6 lg:grid-cols-[1fr_360px]">
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                {loading ? (
                  <div className="flex h-64 items-center justify-center">
                    <Spin />
                  </div>
                ) : error ? (
                  <div className="flex h-64 flex-col items-center justify-center gap-3 text-gray-500">
                    <span className="text-red-500">{error}</span>
                    <Button onClick={() => loadList(category)}>重试</Button>
                  </div>
                ) : visitors.length === 0 ? (
                  <div className="flex h-64 items-center justify-center">
                    <Empty description="暂无记录" />
                  </div>
                ) : (
                  <Table<Visitor>
                    rowKey="id"
                    columns={columns}
                    dataSource={visitors}
                    pagination={{ pageSize: 20, showSizeChanger: false }}
                    scroll={{ x: 600 }}
                    onRow={(record) => ({
                      onClick: () => setSelectedId(record.id),
                      style: { cursor: 'pointer', background: selectedId === record.id ? '#e6f4ff' : undefined },
                    })}
                  />
                )}
              </div>
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                {selectedId === null ? (
                  <div className="flex h-64 items-center justify-center">
                    <Empty description="请选择一条记录查看详情" />
                  </div>
                ) : detailLoading ? (
                  <div className="flex h-64 items-center justify-center">
                    <Spin />
                  </div>
                ) : detail === null ? (
                  <div className="flex h-64 items-center justify-center text-gray-400">加载失败</div>
                ) : (
                  <div className="flex flex-col">
                    <div className="border-b border-gray-100 px-4 py-3">
                      <span className="text-sm font-semibold text-gray-800">{detail.name}</span>
                      <Tag color={STATUS_META[detail.status].color} className="ml-2">
                        {STATUS_META[detail.status].label}
                      </Tag>
                    </div>
                    <div className="flex-1 overflow-auto p-4">
                      <Descriptions column={1} size="small" labelStyle={{ width: 100, color: '#666' }}>
                        <Descriptions.Item label="手机号">{detail.phone}</Descriptions.Item>
                        <Descriptions.Item label="身份证号">{detail.idCard}</Descriptions.Item>
                        <Descriptions.Item label="公司">{detail.company}</Descriptions.Item>
                        <Descriptions.Item label="访问事由">{detail.visitReason}</Descriptions.Item>
                        <Descriptions.Item label="被访人">{detail.hostPerson}</Descriptions.Item>
                        <Descriptions.Item label="预计到访">{formatDate(detail.expectedArrivalTime)}</Descriptions.Item>
                        <Descriptions.Item label="车牌号">{detail.licensePlate ?? '—'}</Descriptions.Item>
                        <Descriptions.Item label="创建时间">{formatDate(detail.createdAt)}</Descriptions.Item>
                        <Descriptions.Item label="审批时间">{formatDate(detail.reviewedAt)}</Descriptions.Item>
                      </Descriptions>
                    </div>
                    {detail.status === 'pending' && (
                      <div className="flex gap-2 border-t border-gray-100 px-4 py-3">
                        <Button
                          type="primary"
                          icon={<CheckOutlined />}
                          loading={actionLoading}
                          onClick={handleApprove}
                          className="flex-1"
                        >
                          通过
                        </Button>
                        <Button
                          danger
                          icon={<CloseOutlined />}
                          loading={actionLoading}
                          onClick={handleReject}
                          className="flex-1"
                        >
                          拒绝
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Layout.Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  )
}
