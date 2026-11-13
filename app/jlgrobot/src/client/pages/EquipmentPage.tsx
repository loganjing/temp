import { useCallback, useEffect, useState } from 'react'
import { Table, Button, Modal, Form, Input, Select, Tag, Space, Spin, Empty, App as AntApp } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { apiRequest, ApiRequestError } from '../platform/api-client'
import type { Equipment, EquipmentListResponse, EquipmentStatus, CreateEquipmentRequest } from '../types'

const STATUS_LABELS: Record<EquipmentStatus, string> = {
  running: '运行中',
  standby: '待机',
  fault: '故障',
  offline: '离线',
}

const STATUS_COLORS: Record<EquipmentStatus, string> = {
  running: 'green',
  standby: 'blue',
  fault: 'red',
  offline: 'default',
}

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({
  value: value as EquipmentStatus,
  label,
}))

export default function EquipmentPage() {
  const { message } = AntApp.useApp()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<Equipment[]>([])
  const [selected, setSelected] = useState<Equipment | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [form] = Form.useForm<CreateEquipmentRequest>()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiRequest<EquipmentListResponse>('/api/equipment')
      setItems(data.items ?? [])
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : '加载设备列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleCreate = async () => {
    const values = await form.validateFields()
    setCreating(true)
    try {
      const body: CreateEquipmentRequest = {
        code: values.code,
        name: values.name,
        status: values.status ?? 'standby',
      }
      await apiRequest<Equipment>('/api/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      message.success('设备创建成功')
      setCreateOpen(false)
      form.resetFields()
      await load()
    } catch (e) {
      message.error(e instanceof ApiRequestError ? e.message : '创建设备失败')
    } finally {
      setCreating(false)
    }
  }

  const handleUpdateStatus = async (id: number, status: EquipmentStatus) => {
    setUpdatingStatus(true)
    try {
      const updated = await apiRequest<Equipment>(`/api/equipment/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      message.success('状态更新成功')
      setSelected(updated)
      setItems((prev) => prev.map((e) => (e.id === id ? updated : e)))
    } catch (e) {
      message.error(e instanceof ApiRequestError ? e.message : '更新状态失败')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const columns: ColumnsType<Equipment> = [
    { title: '编号', dataIndex: 'code', key: 'code' },
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: EquipmentStatus) => (
        <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Tag>
      ),
    },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
  ]

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>设备列表</h3>
          <Space>
            {error && <Button onClick={load}>重试</Button>}
            <Button type="primary" onClick={() => setCreateOpen(true)}>创建设备</Button>
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
            dataSource={items}
            pagination={false}
            rowSelection={{
              type: 'radio',
              selectedRowKeys: selected ? [selected.id] : [],
              onChange: (_, rows) => setSelected(rows[0] ?? null),
            }}
            onRow={(record) => ({ onClick: () => setSelected(record) })}
            locale={{ emptyText: '暂无设备，请创建' }}
          />
        )}
      </div>
      <div style={{ width: 320, flexShrink: 0 }}>
        <h3 style={{ marginBottom: 16 }}>设备详情</h3>
        {selected ? (
          <div>
            <p><strong>编号：</strong>{selected.code}</p>
            <p><strong>名称：</strong>{selected.name}</p>
            <p>
              <strong>状态：</strong>
              <Tag color={STATUS_COLORS[selected.status]}>{STATUS_LABELS[selected.status]}</Tag>
            </p>
            <p><strong>创建时间：</strong>{selected.createdAt}</p>
            <p><strong>更新时间：</strong>{selected.updatedAt}</p>
            <div style={{ marginTop: 16 }}>
              <label style={{ display: 'block', marginBottom: 8 }}>更新状态：</label>
              <Select
                style={{ width: '100%' }}
                value={selected.status}
                options={STATUS_OPTIONS}
                loading={updatingStatus}
                onChange={(value: EquipmentStatus) => handleUpdateStatus(selected.id, value)}
              />
            </div>
          </div>
        ) : (
          <Empty description="请选择设备查看详情" />
        )}
      </div>
      <Modal
        title="创建设备"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); form.resetFields() }}
        confirmLoading={creating}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="设备编号" rules={[{ required: true, message: '请输入设备编号' }]}>
            <Input placeholder="如 EQ-001" />
          </Form.Item>
          <Form.Item name="name" label="设备名称" rules={[{ required: true, message: '请输入设备名称' }]}>
            <Input placeholder="如 1号机器人" />
          </Form.Item>
          <Form.Item name="status" label="初始状态" initialValue="standby">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
