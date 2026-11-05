import { App, Form, Input, Modal, Select } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { apiRequest, errorFields, errorMessage } from '../platform/api-client'
import { PRIORITY_OPTIONS } from '../platform/labels'
import type { Priority, ReferenceData, TicketSummary } from '../platform/types'

interface Props {
  open: boolean
  onClose: () => void
  onSubmitted: (ticket: TicketSummary) => void
}

interface FormValues {
  subject: string
  description: string
  categoryId: string
  priority: Priority
}

export function SubmitTicketModal({ open, onClose, onSubmitted }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [categories, setCategories] = useState<ReferenceData['categories']>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const loadCategories = useCallback(async () => {
    setLoading(true)
    try {
      const reference = await apiRequest<ReferenceData>('/api/reference')
      setCategories(reference.categories)
    } catch (cause) {
      message.error(errorMessage(cause, '加载分类失败'))
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    if (open) void loadCategories()
  }, [open, loadCategories])

  const submit = async () => {
    let values: FormValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSubmitting(true)
    try {
      const result = await apiRequest<{ ticket: TicketSummary }>('/api/tickets', {
        method: 'POST',
        body: JSON.stringify(values),
      })
      message.success(`工单 ${result.ticket.code} 已提交`)
      form.resetFields()
      onSubmitted(result.ticket)
    } catch (cause) {
      const fields = errorFields(cause)
      if (fields) {
        form.setFields(
          (Object.entries(fields) as Array<[keyof FormValues, string]>).map(([name, error]) => ({ name, errors: [error] })),
        )
      }
      message.error(errorMessage(cause, '提交工单失败'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="提交新工单"
      open={open}
      okText="提交"
      cancelText="取消"
      confirmLoading={submitting}
      onOk={() => void submit()}
      onCancel={() => {
        form.resetFields()
        onClose()
      }}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false} initialValues={{ priority: 'P2' }}>
        <Form.Item label="主题" name="subject" rules={[{ required: true, message: '请填写主题' }, { max: 120, message: '主题不能超过 120 个字符' }]}>
          <Input maxLength={120} showCount placeholder="简要说明问题" />
        </Form.Item>
        <Form.Item label="分类" name="categoryId" rules={[{ required: true, message: '请选择分类' }]}>
          <Select
            loading={loading}
            placeholder="选择问题分类"
            options={categories.map((category) => ({ value: category.id, label: category.name }))}
            notFoundContent="暂无可用分类"
          />
        </Form.Item>
        <Form.Item label="优先级" name="priority" rules={[{ required: true, message: '请选择优先级' }]}>
          <Select options={PRIORITY_OPTIONS} />
        </Form.Item>
        <Form.Item label="问题描述" name="description" rules={[{ required: true, message: '请填写问题描述' }, { max: 5000, message: '描述不能超过 5000 个字符' }]}>
          <Input.TextArea rows={5} maxLength={5000} showCount placeholder="描述问题现象、期望结果与影响范围" />
        </Form.Item>
      </Form>
    </Modal>
  )
}