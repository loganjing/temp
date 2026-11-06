import { Button, Form, Input, Modal, Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'
import { message } from 'antd'
import type { Device, FaultDiagnosis } from '../types'
import { createFault, listFaults } from '../platform/api-client'

export function FaultDiagnosisTab({ device }: { device: Device }) {
  const [faults, setFaults] = useState<FaultDiagnosis[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<{ fault_description: string; diagnosis_result?: string }>()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listFaults(device.id)
      .then((res) => {
        if (!cancelled) setFaults(res.faults)
      })
      .catch((err) => {
        if (!cancelled) message.error(err instanceof Error ? err.message : '加载故障记录失败')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [device.id])

  async function reload() {
    const res = await listFaults(device.id)
    setFaults(res.faults)
  }

  async function handleOk() {
    const values = await form.validateFields()
    await createFault(device.id, {
      fault_description: values.fault_description,
      diagnosis_result: values.diagnosis_result?.trim() ? values.diagnosis_result.trim() : null,
    })
    message.success('故障诊断记录已创建')
    setOpen(false)
    await reload()
  }

  const columns: ColumnsType<FaultDiagnosis> = [
    { title: '故障描述', dataIndex: 'fault_description', key: 'fault_description', ellipsis: true },
    { title: '诊断结果', dataIndex: 'diagnosis_result', key: 'diagnosis_result', ellipsis: true, render: (v: string | null) => v ?? '—' },
    { title: '记录时间', dataIndex: 'created_at', key: 'created_at', width: 200 },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Button type="primary" onClick={() => setOpen(true)}>
        新建故障诊断记录
      </Button>
      <Table<FaultDiagnosis>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={faults}
        columns={columns}
        pagination={false}
        locale={{ emptyText: '暂无故障诊断记录' }}
      />
      <Modal title="新建故障诊断记录" open={open} onCancel={() => setOpen(false)} onOk={handleOk} okText="创建" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="fault_description" label="故障描述" rules={[{ required: true, message: '请输入故障描述' }]}>
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
          <Form.Item name="diagnosis_result" label="诊断结果">
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
