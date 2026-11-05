import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Form, Input, Select, message, Typography } from 'antd'
import { ticketApi } from '../api/ticket-client'
import type { SlaPriority } from '../api/types'
import { PRIORITY_OPTIONS } from '../constants'

export default function CreateTicketPage() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [busy, setBusy] = useState(false)

  const onFinish = async (values: { subject: string; description: string; category: string; slaPriority: SlaPriority }) => {
    setBusy(true)
    try {
      const result = await ticketApi.create({
        subject: values.subject,
        description: values.description,
        category: values.category,
        slaPriority: values.slaPriority,
      })
      message.success('工单已创建')
      navigate(`/tickets/${encodeURIComponent(result.ticket.id)}`)
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '创建工单失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card style={{ maxWidth: 720, margin: '0 auto' }} title={<Typography.Title level={4} style={{ margin: 0 }}>创建工单</Typography.Title>}>
      <Form
        form={form}
        layout="vertical"
        onFinish={(v) => void onFinish(v)}
        initialValues={{ slaPriority: 'P3' }}
      >
        <Form.Item name="subject" label="主题" rules={[{ required: true, message: '请输入主题', min: 1, max: 200 }]}>
          <Input maxLength={200} placeholder="简要描述问题" />
        </Form.Item>
        <Form.Item name="category" label="分类" rules={[{ required: true, message: '请输入分类' }]}>
          <Input maxLength={100} placeholder="例如：网络问题、软件故障" />
        </Form.Item>
        <Form.Item name="slaPriority" label="SLA 优先级">
          <Select options={PRIORITY_OPTIONS} />
        </Form.Item>
        <Form.Item name="description" label="描述" rules={[{ required: true, message: '请输入描述', min: 1, max: 5000 }]}>
          <Input.TextArea rows={6} maxLength={5000} showCount placeholder="详细描述问题或请求" />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <Button type="primary" htmlType="submit" loading={busy}>提交工单</Button>
        </Form.Item>
      </Form>
    </Card>
  )
}
