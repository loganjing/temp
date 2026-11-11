import { useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { devicesApi, upgradesApi } from '../platform/api-client'
import { ApiRequestError } from '../platform/api-client'
import { useAsync } from '../hooks/useAsync'
import type { Device, UpgradeStatus, UpgradeTask } from '../types'
import {
  nextUpgradeStatuses,
  upgradeStatusColor,
  upgradeStatusLabel,
} from '../constants'
import { ErrorView, TableSkeleton } from '../components/StateViews'

const { Title } = Typography

const TERMINAL: UpgradeStatus[] = ['success', 'failed']

export default function UpgradesPage() {
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined)
  const { data, loading, error, reload, setData } = useAsync(() => upgradesApi.list(deviceId), [deviceId])
  const { data: devices } = useAsync(() => devicesApi.list())
  const [createOpen, setCreateOpen] = useState(false)
  const [advanceTarget, setAdvanceTarget] = useState<UpgradeTask | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const [createForm] = Form.useForm()
  const [advanceForm] = Form.useForm()

  const deviceOptions = useMemo(
    () => (devices ?? []).map((d) => ({ value: d.id, label: d.name })),
    [devices],
  )

  async function handleCreate(values: { deviceId: string }) {
    setSubmitting(true)
    try {
      const created = await upgradesApi.create({ deviceId: values.deviceId })
      message.success('升级任务已创建')
      setCreateOpen(false)
      createForm.resetFields()
      if (!deviceId || created.deviceId === deviceId) {
        setData((prev) => [created, ...(prev ?? [])])
      }
    } catch (err) {
      message.error(err instanceof ApiRequestError ? err.message : '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  function openAdvance(task: UpgradeTask) {
    setAdvanceTarget(task)
    const nextOptions = nextUpgradeStatuses(task.status)
    advanceForm.setFieldsValue({ status: nextOptions[0], result: undefined })
  }

  async function handleAdvance(values: { status: UpgradeStatus; result?: string }) {
    if (!advanceTarget) return
    const isTerminal = TERMINAL.includes(values.status)
    setSubmitting(true)
    try {
      const updated = await upgradesApi.advance(advanceTarget.id, {
        status: values.status,
        result: isTerminal ? values.result?.trim() || undefined : undefined,
      })
      message.success('状态已更新')
      setAdvanceTarget(undefined)
      setData((prev) => (prev ?? []).map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      message.error(err instanceof ApiRequestError ? err.message : '更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  const columns: ColumnsType<UpgradeTask> = [
    { title: '设备', dataIndex: 'deviceName', ellipsis: { showTitle: true } },
    {
      title: '状态',
      dataIndex: 'status',
      render: (v: UpgradeStatus) => <Tag color={upgradeStatusColor[v]}>{upgradeStatusLabel[v]}</Tag>,
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
        const next = nextUpgradeStatuses(record.status)
        if (next.length === 0) return <Typography.Text type="secondary">终态</Typography.Text>
        const label = record.status === 'pending' ? '开始执行' : '推进结果'
        return <Button type="link" size="small" onClick={() => openAdvance(record)}>{label}</Button>
      },
    },
  ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>远程升级</Title>
        <Space>
          <Select
            allowClear
            placeholder="按设备筛选"
            style={{ width: 220 }}
            value={deviceId}
            options={deviceOptions}
            onChange={(v) => setDeviceId(v ?? undefined)}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>发起升级</Button>
        </Space>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorView error={error} onRetry={reload} />
      ) : (
        <Table<UpgradeTask>
          rowKey="id"
          columns={columns}
          dataSource={data}
          pagination={data && data.length > 10 ? { pageSize: 10 } : false}
          locale={{ emptyText: '暂无升级任务' }}
        />
      )}

      <Modal
        title="发起升级"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={submitting}
        onOk={() => createForm.submit()}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="deviceId" label="升级设备" rules={[{ required: true, message: '请选择设备' }]}>
            <Select placeholder="请选择设备" options={deviceOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Typography.Text type="secondary">升级任务创建后初始状态为“待执行”。</Typography.Text>
        </Form>
      </Modal>

      <Modal
        title="推进升级状态"
        open={!!advanceTarget}
        onCancel={() => setAdvanceTarget(undefined)}
        confirmLoading={submitting}
        onOk={() => advanceForm.submit()}
        destroyOnClose
      >
        <Form form={advanceForm} layout="vertical" onFinish={handleAdvance}>
          <Form.Item name="status" label="目标状态" rules={[{ required: true }]}>
            <Select
              options={advanceTarget ? nextUpgradeStatuses(advanceTarget.status).map((v) => ({ value: v, label: upgradeStatusLabel[v] })) : []}
            />
          </Form.Item>
          <Form.Item shouldUpdate>
            {({ getFieldValue }) => {
              const status = getFieldValue('status') as UpgradeStatus | undefined
              if (status && TERMINAL.includes(status)) {
                return (
                  <Form.Item name="result" label="升级结果">
                    <Input.TextArea placeholder="请输入升级结果描述" rows={3} maxLength={500} />
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
