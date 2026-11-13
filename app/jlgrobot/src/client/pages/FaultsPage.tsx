import { useCallback, useEffect, useState } from 'react'
import { Select, Table, Button, Form, Input, DatePicker, Space, Spin, Empty, App as AntApp, Card } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { apiRequest, ApiRequestError } from '../platform/api-client'
import type { Equipment, EquipmentListResponse, FaultRecord, FaultListResponse, CreateFaultRequest } from '../types'

export default function FaultsPage() {
  const { message } = AntApp.useApp()
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([])
  const [equipmentLoading, setEquipmentLoading] = useState(true)
  const [equipmentError, setEquipmentError] = useState<string | null>(null)
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null)

  const [faults, setFaults] = useState<FaultRecord[]>([])
  const [faultsLoading, setFaultsLoading] = useState(false)
  const [faultsError, setFaultsError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [form] = Form.useForm()

  const loadEquipment = useCallback(async () => {
    setEquipmentLoading(true)
    setEquipmentError(null)
    try {
      const data = await apiRequest<EquipmentListResponse>('/api/equipment')
      setEquipmentList(data.items ?? [])
    } catch (e) {
      setEquipmentError(e instanceof ApiRequestError ? e.message : '加载设备列表失败')
    } finally {
      setEquipmentLoading(false)
    }
  }, [])

  const loadFaults = useCallback(async (equipmentId: number) => {
    setFaultsLoading(true)
    setFaultsError(null)
    try {
      const data = await apiRequest<FaultListResponse>(`/api/equipment/${equipmentId}/faults`)
      setFaults(data.items ?? [])
    } catch (e) {
      setFaultsError(e instanceof ApiRequestError ? e.message : '加载故障记录失败')
    } finally {
      setFaultsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEquipment()
  }, [loadEquipment])

  useEffect(() => {
    if (selectedEquipmentId !== null) loadFaults(selectedEquipmentId)
    else setFaults([])
  }, [selectedEquipmentId, loadFaults])

  const handleCreate = async () => {
    const values = await form.validateFields()
    if (selectedEquipmentId === null) return
    setCreating(true)
    try {
      const body: CreateFaultRequest = {
        description: values.description,
        occurred_at: values.occurredAt.toISOString(),
      }
      await apiRequest<FaultRecord>(`/api/equipment/${selectedEquipmentId}/faults`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      message.success('故障记录创建成功')
      form.resetFields()
      await loadFaults(selectedEquipmentId)
    } catch (e) {
      message.error(e instanceof ApiRequestError ? e.message : '创建故障记录失败')
    } finally {
      setCreating(false)
    }
  }

  const columns: ColumnsType<FaultRecord> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '故障描述', dataIndex: 'description', key: 'description' },
    { title: '发生时间', dataIndex: 'occurredAt', key: 'occurredAt' },
    { title: '记录时间', dataIndex: 'createdAt', key: 'createdAt' },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        {equipmentLoading ? (
          <Spin />
        ) : equipmentError ? (
          <Space>
            <span style={{ color: '#ff4d4f' }}>{equipmentError}</span>
            <Button size="small" onClick={loadEquipment}>重试</Button>
          </Space>
        ) : (
          <Space>
            <span>选择设备：</span>
            <Select
              style={{ width: 300 }}
              placeholder="请选择设备"
              value={selectedEquipmentId}
              onChange={(value: number) => setSelectedEquipmentId(value)}
              options={equipmentList.map((e) => ({ value: e.id, label: `${e.code} - ${e.name}` }))}
            />
          </Space>
        )}
      </div>
      {selectedEquipmentId === null ? (
        <Empty description="请先选择设备" />
      ) : (
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ marginBottom: 16 }}>故障记录</h3>
            {faultsLoading ? (
              <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
            ) : faultsError ? (
              <Space>
                <span style={{ color: '#ff4d4f' }}>{faultsError}</span>
                <Button size="small" onClick={() => loadFaults(selectedEquipmentId)}>重试</Button>
              </Space>
            ) : (
              <Table
                rowKey="id"
                columns={columns}
                dataSource={faults}
                pagination={false}
                locale={{ emptyText: '暂无故障记录' }}
              />
            )}
          </div>
          <Card title="录入故障记录" style={{ width: 360, flexShrink: 0 }}>
            <Form form={form} layout="vertical">
              <Form.Item name="description" label="故障描述" rules={[{ required: true, message: '请输入故障描述' }]}>
                <Input.TextArea rows={3} placeholder="请描述故障信息" />
              </Form.Item>
              <Form.Item name="occurredAt" label="发生时间" rules={[{ required: true, message: '请选择发生时间' }]}>
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
              <Button type="primary" loading={creating} onClick={handleCreate} block>
                保存故障记录
              </Button>
            </Form>
          </Card>
        </div>
      )}
    </div>
  )
}
