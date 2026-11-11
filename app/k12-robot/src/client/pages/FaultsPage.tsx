import { useMemo, useState } from 'react'
import { Button, DatePicker, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { devicesApi, faultsApi } from '../platform/api-client'
import { ApiRequestError } from '../platform/api-client'
import { useAsync } from '../hooks/useAsync'
import type { Device, Fault } from '../types'
import { ErrorView, TableSkeleton } from '../components/StateViews'

const { Title } = Typography

export default function FaultsPage() {
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined)
  const { data, loading, error, reload, setData } = useAsync(() => faultsApi.list(deviceId), [deviceId])
  const { data: devices } = useAsync(() => devicesApi.list())
  const [recordOpen, setRecordOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  const deviceOptions = useMemo(
    () => (devices ?? []).map((d) => ({ value: d.id, label: d.name })),
    [devices],
  )

  async function handleRecord(values: { deviceId: string; description: string; occurredAt: dayjs.Dayjs }) {
    setSubmitting(true)
    try {
      const created = await faultsApi.record({
        deviceId: values.deviceId,
        description: values.description.trim(),
        occurredAt: values.occurredAt.toISOString(),
      })
      message.success('故障已记录')
      setRecordOpen(false)
      form.resetFields()
      if (!deviceId || created.deviceId === deviceId) {
        setData((prev) => [created, ...(prev ?? [])])
      }
    } catch (err) {
      message.error(err instanceof ApiRequestError ? err.message : '记录失败')
    } finally {
      setSubmitting(false)
    }
  }

  const columns: ColumnsType<Fault> = [
    { title: '设备', dataIndex: 'deviceName', ellipsis: { showTitle: true } },
    { title: '描述', dataIndex: 'description', ellipsis: { showTitle: true } },
    {
      title: '发生时间',
      dataIndex: 'occurredAt',
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '—'),
    },
    {
      title: '关联工单',
      dataIndex: 'repairOrderId',
      render: (v: string | null) => (v ? <Tag color="orange">{v.slice(0, 8)}</Tag> : '—'),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: () => <Button type="link" size="small" disabled>查看工单</Button>,
    },
  ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>故障诊断</Title>
        <Space>
          <Select
            allowClear
            placeholder="按设备筛选"
            style={{ width: 220 }}
            value={deviceId}
            options={deviceOptions}
            onChange={(v) => setDeviceId(v ?? undefined)}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setRecordOpen(true)}>记录故障</Button>
        </Space>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorView error={error} onRetry={reload} />
      ) : (
        <Table<Fault>
          rowKey="id"
          columns={columns}
          dataSource={data}
          pagination={data && data.length > 10 ? { pageSize: 10 } : false}
          locale={{ emptyText: '暂无故障记录' }}
        />
      )}

      <Modal
        title="记录故障"
        open={recordOpen}
        onCancel={() => setRecordOpen(false)}
        confirmLoading={submitting}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleRecord}>
          <Form.Item name="deviceId" label="故障设备" rules={[{ required: true, message: '请选择设备' }]}>
            <Select placeholder="请选择设备" options={deviceOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="description" label="故障描述" rules={[{ required: true, message: '请输入故障描述' }]}>
            <Input.TextArea placeholder="请输入故障描述" rows={3} maxLength={500} />
          </Form.Item>
          <Form.Item name="occurredAt" label="发生时间" rules={[{ required: true, message: '请选择发生时间' }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
