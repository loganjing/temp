import { useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { devicesApi, faultsApi, repairOrdersApi } from '../platform/api-client'
import { ApiRequestError } from '../platform/api-client'
import { useAsync } from '../hooks/useAsync'
import type { Device, Fault, RepairOrder, RepairOrderStatus } from '../types'
import {
  nextRepairOrderStatuses,
  repairOrderStatusColor,
  repairOrderStatusLabel,
} from '../constants'
import { ErrorView, TableSkeleton } from '../components/StateViews'

const { Title } = Typography

const STATUS_OPTIONS: RepairOrderStatus[] = ['created', 'in_progress', 'completed']

export default function RepairOrdersPage() {
  const [status, setStatus] = useState<RepairOrderStatus | undefined>(undefined)
  const { data, loading, error, reload, setData } = useAsync(() => repairOrdersApi.list(status), [status])
  const { data: devices } = useAsync(() => devicesApi.list())
  const { data: faults } = useAsync(() => faultsApi.list())
  const [createOpen, setCreateOpen] = useState(false)
  const [advanceTarget, setAdvanceTarget] = useState<RepairOrder | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const [createForm] = Form.useForm()
  const [advanceForm] = Form.useForm()

  const deviceOptions = useMemo(
    () => (devices ?? []).map((d) => ({ value: d.id, label: d.name })),
    [devices],
  )

  const faultOptions = useMemo(
    () => (faults ?? []).map((f) => ({ value: f.id, label: `${f.deviceName} · ${f.description.slice(0, 20)}` })),
    [faults],
  )

  async function handleCreate(values: { deviceId: string; faultId?: string; description: string; requirement?: string }) {
    setSubmitting(true)
    try {
      const created = await repairOrdersApi.create({
        deviceId: values.deviceId,
        faultId: values.faultId || undefined,
        description: values.description.trim(),
        requirement: values.requirement?.trim() || undefined,
      })
      message.success('工单已创建')
      setCreateOpen(false)
      createForm.resetFields()
      if (!status || created.status === status) {
        setData((prev) => [created, ...(prev ?? [])])
      }
    } catch (err) {
      message.error(err instanceof ApiRequestError ? err.message : '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  function openAdvance(order: RepairOrder) {
    setAdvanceTarget(order)
    const nextOptions = nextRepairOrderStatuses(order.status)
    advanceForm.setFieldsValue({ status: nextOptions[0], result: undefined })
  }

  async function handleAdvance(values: { status: RepairOrderStatus; result?: string }) {
    if (!advanceTarget) return
    const isTerminal = values.status === 'completed'
    setSubmitting(true)
    try {
      const updated = await repairOrdersApi.advance(advanceTarget.id, {
        status: values.status,
        result: isTerminal ? values.result?.trim() || undefined : undefined,
      })
      message.success('状态已更新')
      setAdvanceTarget(undefined)
      setData((prev) => {
        if (status && updated.status !== status) {
          return (prev ?? []).filter((o) => o.id !== updated.id)
        }
        return (prev ?? []).map((o) => (o.id === updated.id ? updated : o))
      })
    } catch (err) {
      message.error(err instanceof ApiRequestError ? err.message : '更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  const columns: ColumnsType<RepairOrder> = [
    { title: '设备', dataIndex: 'deviceName', ellipsis: { showTitle: true } },
    { title: '描述', dataIndex: 'description', ellipsis: { showTitle: true } },
    {
      title: '状态',
      dataIndex: 'status',
      render: (v: RepairOrderStatus) => <Tag color={repairOrderStatusColor[v]}>{repairOrderStatusLabel[v]}</Tag>,
    },
    { title: '结果', dataIndex: 'result', render: (v: string | null) => v ?? '—' },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '—'),
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_, record) => {
        const next = nextRepairOrderStatuses(record.status)
        if (next.length === 0) return <Typography.Text type="secondary">终态</Typography.Text>
        const label = record.status === 'created' ? '开始处理' : '完成工单'
        return <Button type="link" size="small" onClick={() => openAdvance(record)}>{label}</Button>
      },
    },
  ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>维修工单</Title>
        <Space>
          <Select
            allowClear
            placeholder="按状态筛选"
            style={{ width: 180 }}
            value={status}
            options={STATUS_OPTIONS.map((v) => ({ value: v, label: repairOrderStatusLabel[v] }))}
            onChange={(v) => setStatus(v ?? undefined)}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建工单</Button>
        </Space>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorView error={error} onRetry={reload} />
      ) : (
        <Table<RepairOrder>
          rowKey="id"
          columns={columns}
          dataSource={data}
          pagination={data && data.length > 10 ? { pageSize: 10 } : false}
          locale={{ emptyText: '暂无维修工单' }}
        />
      )}

      <Modal
        title="创建维修工单"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={submitting}
        onOk={() => createForm.submit()}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="deviceId" label="关联设备" rules={[{ required: true, message: '请选择设备' }]}>
            <Select placeholder="请选择设备" options={deviceOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="faultId" label="关联故障（可选）">
            <Select placeholder="请选择关联故障" options={faultOptions} allowClear showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="description" label="故障/维护描述" rules={[{ required: true, message: '请输入描述' }]}>
            <Input.TextArea placeholder="请输入描述" rows={3} maxLength={500} />
          </Form.Item>
          <Form.Item name="requirement" label="维修要求（可选）">
            <Input.TextArea placeholder="请输入维修要求" rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="推进工单状态"
        open={!!advanceTarget}
        onCancel={() => setAdvanceTarget(undefined)}
        confirmLoading={submitting}
        onOk={() => advanceForm.submit()}
        destroyOnClose
      >
        <Form form={advanceForm} layout="vertical" onFinish={handleAdvance}>
          <Form.Item name="status" label="目标状态" rules={[{ required: true }]}>
            <Select
              options={advanceTarget ? nextRepairOrderStatuses(advanceTarget.status).map((v) => ({ value: v, label: repairOrderStatusLabel[v] })) : []}
            />
          </Form.Item>
          <Form.Item shouldUpdate>
            {({ getFieldValue }) => {
              const target = getFieldValue('status') as RepairOrderStatus | undefined
              if (target === 'completed') {
                return (
                  <Form.Item name="result" label="处理结果">
                    <Input.TextArea placeholder="请输入处理结果" rows={3} maxLength={500} />
                  </Form.Item>
                )
              }
              return null
            }}
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
