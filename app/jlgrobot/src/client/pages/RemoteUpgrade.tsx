// M3 远程升级 — 按设备筛选的升级任务列表 + 创建 + 状态更新
import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Dropdown,
  Form,
  Input,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
  type MenuProps,
} from 'antd'
import { PlusOutlined, ReloadOutlined, DownOutlined } from '@ant-design/icons'
import { createUpgradeTask, listUpgradeTasks, updateUpgradeTaskStatus } from '../api'
import type { UpgradeTask, UpgradeTaskStatus } from '../types'
import { DeviceSelect } from '../components/DeviceSelect'

const { Title } = Typography

const statusConfig: Record<UpgradeTaskStatus, { color: string; text: string }> = {
  pending: { color: 'default', text: '待执行' },
  executing: { color: 'processing', text: '执行中' },
  success: { color: 'success', text: '成功' },
  failed: { color: 'error', text: '失败' },
}

function nextStatuses(current: UpgradeTaskStatus): UpgradeTaskStatus[] {
  if (current === 'pending') return ['executing']
  if (current === 'executing') return ['success', 'failed']
  return []
}

export function RemoteUpgradePage() {
  const [deviceId, setDeviceId] = useState<string | undefined>()
  const [list, setList] = useState<UpgradeTask[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | undefined>()
  const [form] = Form.useForm<{ packageId: string }>()

  const load = useCallback(() => {
    if (!deviceId) {
      setList([])
      return
    }
    setLoading(true)
    listUpgradeTasks(deviceId)
      .then(setList)
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : '加载升级任务列表失败')
        setList([])
      })
      .finally(() => setLoading(false))
  }, [deviceId])

  useEffect(() => {
    load()
  }, [load])

  async function handleSubmit() {
    const values = await form.validateFields()
    if (!deviceId) return
    setSubmitting(true)
    try {
      await createUpgradeTask(deviceId, values.packageId)
      message.success('升级任务已创建')
      setModalOpen(false)
      form.resetFields()
      load()
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '创建升级任务失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStatusUpdate(taskId: string, status: UpgradeTaskStatus) {
    setUpdatingId(taskId)
    try {
      const updated = await updateUpgradeTaskStatus(taskId, status)
      setList((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      message.success('升级任务状态已更新')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '状态更新失败')
    } finally {
      setUpdatingId(undefined)
    }
  }

  return (
    <div>
      <Title level={4}>远程升级</Title>
      <Card>
        <Space style={{ marginBottom: 16 }}>
          <span>按设备筛选：</span>
          <DeviceSelect value={deviceId} onChange={(v) => setDeviceId(v)} allowClear />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!deviceId}
            onClick={() => setModalOpen(true)}
          >
            创建升级任务
          </Button>
        </Space>
        <Spin spinning={loading}>
          <Table<UpgradeTask>
            rowKey="id"
            dataSource={list}
            pagination={false}
            size="middle"
            columns={[
              { title: '升级包标识', dataIndex: 'packageId' },
              {
                title: '状态',
                dataIndex: 'status',
                render: (s: UpgradeTaskStatus) => (
                  <Tag color={statusConfig[s]?.color}>{statusConfig[s]?.text ?? s}</Tag>
                ),
              },
              {
                title: '发起时间',
                dataIndex: 'initiatedAt',
                render: (v: string) => new Date(v).toLocaleString('zh-CN'),
              },
              {
                title: '完成时间',
                dataIndex: 'completedAt',
                render: (v: string | null) => (v ? new Date(v).toLocaleString('zh-CN') : '—'),
              },
              {
                title: '操作',
                key: 'action',
                render: (_, record) => {
                  const next = nextStatuses(record.status)
                  if (next.length === 0) return <span style={{ color: '#999' }}>终态</span>
                  const items: MenuProps['items'] = next.map((s) => ({
                    key: s,
                    label: statusConfig[s].text,
                    onClick: () => handleStatusUpdate(record.id, s),
                  }))
                  return (
                    <Dropdown menu={{ items }} trigger={['click']}>
                      <Button size="small" loading={updatingId === record.id}>
                        更新状态 <DownOutlined />
                      </Button>
                    </Dropdown>
                  )
                },
              },
            ]}
          />
        </Spin>
      </Card>
      <Modal
        title="创建升级任务"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="packageId"
            label="升级包标识"
            rules={[{ required: true, message: '请输入升级包标识' }]}
          >
            <Input placeholder="输入升级包标识" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
