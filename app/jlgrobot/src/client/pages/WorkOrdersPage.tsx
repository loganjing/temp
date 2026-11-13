import { useCallback, useEffect, useState } from 'react'
import { Table, Button, Select, Modal, Form, Input, Tag, Space, Spin, Empty, App as AntApp } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { apiRequest, ApiRequestError } from '../platform/api-client'
import type {
  Equipment,
  EquipmentListResponse,
  WorkOrder,
  WorkOrderListResponse,
  WorkOrderStatus,
  UpdateWorkOrderRequest,
} from '../types'

const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  pending: '待处理',
  in_progress: '处理中',
  completed: '已完成',
}

const STATUS_COLORS: Record<WorkOrderStatus, string> = {
  pending: 'default',
  in_progress: 'processing',
  completed: 'green',
}

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({
  value: value as WorkOrderStatus,
  label,
}))

export default function WorkOrdersPage() {
  const { message } = AntApp.useApp()
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [equipmentList, setEquipmentList] = useState<Equipment[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null)

  const [resultModalOrder, setResultModalOrder] = useState<WorkOrder | null>(null)
  const [savingResult, setSavingResult] = useState(false)
  const [resultForm] = Form.useForm<{ result: string }>()

  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null)

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiRequest<WorkOrderListResponse>('/api/work-orders')
      setOrders(data.items ?? [])
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : '加载工单列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadEquipment = useCallback(async () => {
    try {
      const data = await apiRequest<EquipmentListResponse>('/api/equipment')
      setEquipmentList(data.items ?? [])
    } catch {
      // 设备列表加载失败时仅静默处理，不影响工单主流程
    }
  }, [])

  useEffect(() => {
    loadOrders()
    loadEquipment()
  }, [loadOrders, loadEquipment])

  const handleCreate = async () => {
    if (selectedEquipmentId === null) {
      message.warning('请选择设备')
      return
    }
    setCreating(true)
    try {
      await apiRequest<WorkOrder>(`/api/equipment/${selectedEquipmentId}/work-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      message.success('工单创建成功')
      setCreateOpen(false)
      setSelectedEquipmentId(null)
      await loadOrders()
    } catch (e) {
      message.error(e instanceof ApiRequestError ? e.message : '创建工单失败')
    } finally {
      setCreating(false)
    }
  }

  const handleUpdateStatus = async (orderId: number, status: WorkOrderStatus) => {
    setUpdatingStatusId(orderId)
    try {
      const body: UpdateWorkOrderRequest = { status }
      const updated = await apiRequest<WorkOrder>(`/api/work-orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      message.success('工单状态更新成功')
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)))
    } catch (e) {
      message.error(e instanceof ApiRequestError ? e.message : '更新工单状态失败')
    } finally {
      setUpdatingStatusId(null)
    }
  }

  const handleSaveResult = async () => {
    if (!resultModalOrder) return
    const values = await resultForm.validateFields()
    setSavingResult(true)
    try {
      const body: UpdateWorkOrderRequest = { status: 'completed', result: values.result }
      const updated = await apiRequest<WorkOrder>(`/api/work-orders/${resultModalOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      message.success('维修结果已记录')
      setResultModalOrder(null)
      resultForm.resetFields()
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    } catch (e) {
      message.error(e instanceof ApiRequestError ? e.message : '记录维修结果失败')
    } finally {
      setSavingResult(false)
    }
  }

  const columns: ColumnsType<WorkOrder> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '设备ID', dataIndex: 'equipmentId', key: 'equipmentId', width: 80 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: WorkOrderStatus) => <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Tag>,
    },
    { title: '维修结果', dataIndex: 'result', key: 'result', render: (v: string | null) => v ?? '—' },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
    { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt' },
    {
      title: '操作',
      key: 'action',
      width: 240,
      render: (_, record) => (
        <Space>
          <Select
            size="small"
            value={record.status}
            options={STATUS_OPTIONS}
            loading={updatingStatusId === record.id}
            onChange={(value: WorkOrderStatus) => handleUpdateStatus(record.id, value)}
            style={{ width: 120 }}
          />
          <Button
            size="small"
            disabled={record.status === 'completed'}
            onClick={() => {
              setResultModalOrder(record)
              resultForm.resetFields()
            }}
          >
            记录结果
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>维修工单</h3>
        <Space>
          {error && <Button onClick={loadOrders}>重试</Button>}
          <Button type="primary" onClick={() => setCreateOpen(true)}>创建工单</Button>
        </Space>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
      ) : error ? (
        <Empty description={error} />
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={orders}
          pagination={false}
          locale={{ emptyText: '暂无工单' }}
        />
      )}
      <Modal
        title="创建维修工单"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); setSelectedEquipmentId(null) }}
        confirmLoading={creating}
      >
        <Form layout="vertical">
          <Form.Item label="选择设备" required>
            <Select
              placeholder="请选择设备"
              value={selectedEquipmentId}
              onChange={(value: number) => setSelectedEquipmentId(value)}
              options={equipmentList.map((e) => ({ value: e.id, label: `${e.code} - ${e.name}` }))}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="记录维修结果"
        open={resultModalOrder !== null}
        onOk={handleSaveResult}
        onCancel={() => { setResultModalOrder(null); resultForm.resetFields() }}
        confirmLoading={savingResult}
      >
        <Form form={resultForm} layout="vertical">
          <Form.Item name="result" label="维修结果" rules={[{ required: true, message: '请输入维修结果' }]}>
            <Input.TextArea rows={3} placeholder="请描述维修结果" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
