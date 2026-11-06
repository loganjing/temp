import { Form, Input, Modal, Select } from 'antd'
import { useEffect } from 'react'
import { createDevice } from '../platform/api-client'
import { DEVICE_STATUSES } from '../types'

const STATUS_OPTIONS = DEVICE_STATUSES.map((s) => ({ value: s, label: s }))

export function CreateDeviceModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [form] = Form.useForm<{ name: string; model?: string; current_status?: string }>()

  useEffect(() => {
    if (open) form.resetFields()
  }, [open, form])

  async function handleOk() {
    const values = await form.validateFields()
    await createDevice({
      name: values.name,
      model: values.model?.trim() ? values.model.trim() : null,
      current_status: values.current_status ?? 'unknown',
    })
    onCreated()
  }

  return (
    <Modal title="新建设备" open={open} onCancel={onClose} onOk={handleOk} okText="创建" cancelText="取消" destroyOnClose>
      <Form form={form} layout="vertical" initialValues={{ current_status: 'unknown' }}>
        <Form.Item name="name" label="设备名称" rules={[{ required: true, message: '请输入设备名称' }]}>
          <Input placeholder="如：搬运机器人 A1" maxLength={120} />
        </Form.Item>
        <Form.Item name="model" label="设备型号">
          <Input placeholder="如：JLG-Robot-X1" maxLength={120} />
        </Form.Item>
        <Form.Item name="current_status" label="初始状态">
          <Select options={STATUS_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
