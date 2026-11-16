// M4 维修工单 — 列表（按设备筛选）+ 创建表单 + 详情与状态流转
import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Col,
  Descriptions,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
  type MenuProps,
} from 'antd'
import { PlusOutlined, ReloadOutlined, DownOutlined } from '@ant-design/icons'
import {
  createMaintenanceOrder,
  listMaintenanceOrders,
  updateMaintenanceOrderStatus,
} from '../api'
import type { MaintenanceOrder, MaintenanceOrderStatus } from '../types'
import { DeviceSelect } from '../components/DeviceSelect'

const { Title } = Typography

const statusConfig: Record<MaintenanceOrderStatus, { color: string; text: string }> = {
  pending: { color: 'default', text: '待处理' },
  processing: { color: 'processing', text: '处理中' },
  completed: { color: 'success', text: '已完成' },
}

function nextStatuses(current: MaintenanceOrderStatus): MaintenanceOrderStatus[] {
  if (current === 'pending') return ['processing']
  if (current === 'processing') return ['completed']
  return []
}

export function MaintenanceOrdersPage() {
  const [filterDeviceId, setFilterDeviceId] = useState<string | undefined>()
  const [list, setList] = useState<MaintenanceOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [detail, setDetail] = useState<MaintenanceOrder | null>(null)
  const [updatingId, setUpdatingId] = useState<string | undefined>()
  const [form] = Form.useForm<{ deviceId: string; faultDescription: string; technician?: string }>()

  const load = useCallback(() => {
    setLoading(true)
    listMaintenanceOrders(filterDeviceId)
      .then(setList)
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : '加载工单列表失败')
        setList([])
      })
      .finally(() => setLoading(false))
  }, [filterDeviceId])

  useEffect(() => {
    load()
  }, [load])

  async function handleSubmit() {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      await createMaintenanceOrder(values.deviceId, values.faultDescription, values.technician ?? null)
      message.success('维修工单已创建')
      setModalOpen(false)
      form.resetFields()
      load()
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '创建工单失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStatusUpdate(orderId: string, status: MaintenanceOrderStatus) {
    setUpdatingId(orderId)
    try {
      const updated = await updateMaintenanceOrderStatus(orderId, status)
      setList((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
      if (detail?.id === updated.id) setDetail(updated)
      message.success('工单状态已更新')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '状态更新失败')
    } finally {
      setUpdatingId(undefined)
    }
  }

  return (
    <div>
      <Title level={4}>维修工单</Title>
      <Row gutter={16}>
        <Col span={14}>
          <Card
            title="工单列表"
            extra={
              <Space>
                <DeviceSelect
                  value={filterDeviceId}
                  onChange={(v) => setFilterDeviceId(v)}
                  placeholder="按设备筛选"
                  allowClear
                />
                <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
                  刷新
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
                  创建工单
                </Button>
              </Space>
            }
          >
            <Spin spinning={loading}>
              <Table<MaintenanceOrder>
                rowKey="id"
                dataSource={list}
                pagination={false}
                size="middle"
                onRow={(record) => ({ onClick: () => setDetail(record) })}
                columns={[
                  { title: '故障描述', dataIndex: 'faultDescription', ellipsis: true },
                  { title: '维修人员', dataIndex: 'technician', render: (v) => v ?? '—' },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    render: (s: MaintenanceOrderStatus) => (
                      <Tag color={statusConfig[s]?.color}>{statusConfig[s]?.text ?? s}</Tag>
                    ),
                  },
                  {
                    title: '创建时间',
                    dataIndex: 'createdAt',
                    render: (v: string) => new Date(v).toLocaleString('zh-CN'),
                  },
                ]}
              />
            </Spin>
          </Card>
        </Col>
        <Col span={10}>
          <Card title="工单详情">
            {detail ? (
              <Spin spinning={updatingId === detail.id}>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Descriptions column={1} size="small" bordered>
                    <Descriptions.Item label="工单ID">{detail.id}</Descriptions.Item>
                    <Descriptions.Item label="关联设备">{detail.deviceId}</Descriptions.Item>
                    <Descriptions.Item label="故障描述">{detail.faultDescription}</Descriptions.Item>
                    <Descriptions.Item label="维修人员">{detail.technician ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label="状态">
                      <Tag color={statusConfig[detail.status]?.color}>
                        {statusConfig[detail.status]?.text ?? detail.status}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="创建时间">
                      {new Date(detail.createdAt).toLocaleString('zh-CN')}
                    </Descriptions.Item>
                    <Descriptions.Item label="更新时间">
                      {new Date(detail.updatedAt).toLocaleString('zh-CN')}
                    </Descriptions.Item>
                  </Descriptions>
                  {(() => {
                    const next = nextStatuses(detail.status)
                    if (next.length === 0)
                      return <span style={{ color: '#999' }}>已完成（终态，不可回退）</span>
                    const items: MenuProps['items'] = next.map((s) => ({
                      key: s,
                      label: statusConfig[s].text,
                      onClick: () => handleStatusUpdate(detail.id, s),
                    }))
                    return (
                      <Dropdown menu={{ items }} trigger={['click']}>
                        <Button loading={updatingId === detail.id}>
                          流转状态 <DownOutlined />
                        </Button>
                      </Dropdown>
                    )
                  })()}
                </Space>
              </Spin>
            ) : (
              <Empty description="请选择左侧工单查看详情" />
            )}
          </Card>
        </Col>
      </Row>
      <Modal
        title="创建维修工单"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="deviceId"
            label="关联设备"
            rules={[{ required: true, message: '请选择设备' }]}
          >
            <DeviceSelect placeholder="选择设备" />
          </Form.Item>
          <Form.Item
            name="faultDescription"
            label="故障描述"
            rules={[{ required: true, message: '请输入故障描述' }]}
          >
            <Input.TextArea rows={3} placeholder="描述设备故障现象" />
          </Form.Item>
          <Form.Item name="technician" label="维修人员">
            <Input placeholder="维修人员姓名（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
