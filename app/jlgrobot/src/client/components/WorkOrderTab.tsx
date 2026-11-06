import { Button, Form, Input, Modal, Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'
import { message } from 'antd'
import type { Device, RepairOrder } from '../types'
import { createWorkOrder, listWorkOrders } from '../platform/api-client'
import { WorkOrderStatusTag } from './StatusTag'

export function WorkOrderTab({ device }: { device: Device }) {
  const [orders, setOrders] = useState<RepairOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<{ content: string; result?: string }>()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listWorkOrders(device.id)
      .then((res) => {
        if (!cancelled) setOrders(res.work_orders)
      })
      .catch((err) => {
        if (!cancelled) message.error(err instanceof Error ? err.message : '加载维修工单失败')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [device.id])

  async function reload() {
    const res = await listWorkOrders(device.id)
    setOrders(res.work_orders)
  }

  async function handleOk() {
    const values = await form.validateFields()
    await createWorkOrder(device.id, {
      content: values.content,
      result: values.result?.trim() ? values.result.trim() : null,
    })
    message.success('维修工单已创建')
    setOpen(false)
    await reload()
  }

  const columns: ColumnsType<RepairOrder> = [
    { title: '维修内容', dataIndex: 'content', key: 'content', ellipsis: true },
    { title: '处理结果', dataIndex: 'result', key: 'result', ellipsis: true, render: (v: string | null) => v ?? '—' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (s: string) => <WorkOrderStatusTag status={s} /> },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 200 },
    { title: '更新时间', dataIndex: 'updated_at', key: 'updated_at', width: 200 },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Button type="primary" onClick={() => setOpen(true)}>
        新建维修工单
      </Button>
      <Table<RepairOrder>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={orders}
        columns={columns}
        pagination={false}
        locale={{ emptyText: '暂无维修工单' }}
      />
      <Modal title="新建维修工单" open={open} onCancel={() => setOpen(false)} onOk={handleOk} okText="创建" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="content" label="维修内容" rules={[{ required: true, message: '请输入维修内容' }]}>
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
          <Form.Item name="result" label="处理结果">
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
