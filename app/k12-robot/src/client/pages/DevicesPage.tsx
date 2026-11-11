import { useState } from 'react'
import { Button, Form, Input, Modal, Select, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import { devicesApi } from '../platform/api-client'
import { ApiRequestError } from '../platform/api-client'
import { useAsync } from '../hooks/useAsync'
import type { Device, OnlineStatus, RunningStatus } from '../types'
import { onlineStatusColor, onlineStatusLabel, runningStatusColor, runningStatusLabel } from '../constants'
import { ErrorView, TableSkeleton } from '../components/StateViews'

const { Title } = Typography

const ONLINE_OPTIONS: OnlineStatus[] = ['online', 'offline']
const RUNNING_OPTIONS: RunningStatus[] = ['idle', 'running', 'error', 'maintenance']

export default function DevicesPage() {
  const { data, loading, error, reload, setData } = useAsync(() => devicesApi.list())
  const [registerOpen, setRegisterOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [activeDevice, setActiveDevice] = useState<Device | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const [registerForm] = Form.useForm()
  const [statusForm] = Form.useForm()

  function openStatusModal(device: Device) {
    setActiveDevice(device)
    statusForm.setFieldsValue({
      onlineStatus: device.onlineStatus,
      runningStatus: device.runningStatus,
    })
    setStatusOpen(true)
  }

  async function handleRegister(values: { name: string; model?: string }) {
    setSubmitting(true)
    try {
      const created = await devicesApi.register({ name: values.name.trim(), model: values.model?.trim() || undefined })
      message.success('设备已注册')
      setRegisterOpen(false)
      registerForm.resetFields()
      setData((prev) => [...(prev ?? []), created])
    } catch (err) {
      message.error(err instanceof ApiRequestError ? err.message : '注册失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdateStatus(values: { onlineStatus: OnlineStatus; runningStatus: RunningStatus }) {
    if (!activeDevice) return
    setSubmitting(true)
    try {
      const updated = await devicesApi.updateStatus(activeDevice.id, {
        onlineStatus: values.onlineStatus,
        runningStatus: values.runningStatus,
      })
      message.success('状态已更新')
      setStatusOpen(false)
      setData((prev) => (prev ?? []).map((d) => (d.id === updated.id ? updated : d)))
    } catch (err) {
      message.error(err instanceof ApiRequestError ? err.message : '更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  const columns: ColumnsType<Device> = [
    { title: '名称', dataIndex: 'name', ellipsis: { showTitle: true } },
    { title: '型号', dataIndex: 'model', render: (v: string | null) => v ?? '—' },
    {
      title: '在线状态',
      dataIndex: 'onlineStatus',
      render: (v: OnlineStatus) => <Tag color={onlineStatusColor[v]}>{onlineStatusLabel[v]}</Tag>,
    },
    {
      title: '运行状态',
      dataIndex: 'runningStatus',
      render: (v: RunningStatus) => <Tag color={runningStatusColor[v]}>{runningStatusLabel[v]}</Tag>,
    },
    {
      title: '异常标记',
      dataIndex: 'isAbnormal',
      render: (v: boolean) => (v ? <Tag color="error">异常</Tag> : <Tag>正常</Tag>),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => openStatusModal(record)}>更新状态</Button>
      ),
    },
  ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>设备状态监测</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setRegisterOpen(true)}>注册设备</Button>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorView error={error} onRetry={reload} />
      ) : (
        <Table<Device>
          rowKey="id"
          columns={columns}
          dataSource={data}
          pagination={data && data.length > 10 ? { pageSize: 10 } : false}
          locale={{ emptyText: '暂无设备，点击“注册设备”开始' }}
        />
      )}

      <Modal
        title="注册设备"
        open={registerOpen}
        onCancel={() => setRegisterOpen(false)}
        confirmLoading={submitting}
        onOk={() => registerForm.submit()}
        destroyOnClose
      >
        <Form form={registerForm} layout="vertical" onFinish={handleRegister}>
          <Form.Item name="name" label="设备名称" rules={[{ required: true, message: '请输入设备名称' }]}>
            <Input placeholder="请输入设备名称" maxLength={64} />
          </Form.Item>
          <Form.Item name="model" label="设备型号（可选）">
            <Input placeholder="请输入设备型号" maxLength={64} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="更新设备状态"
        open={statusOpen}
        onCancel={() => setStatusOpen(false)}
        confirmLoading={submitting}
        onOk={() => statusForm.submit()}
        destroyOnClose
      >
        <Form form={statusForm} layout="vertical" onFinish={handleUpdateStatus}>
          <Form.Item name="onlineStatus" label="在线状态" rules={[{ required: true }]}>
            <Select options={ONLINE_OPTIONS.map((v) => ({ value: v, label: onlineStatusLabel[v] }))} />
          </Form.Item>
          <Form.Item name="runningStatus" label="运行状态" rules={[{ required: true }]}>
            <Select options={RUNNING_OPTIONS.map((v) => ({ value: v, label: runningStatusLabel[v] }))} />
          </Form.Item>
          <Typography.Text type="secondary">
            running_status 为 error 时，服务端自动将异常标记置为 true。
          </Typography.Text>
        </Form>
      </Modal>
    </>
  )
}
