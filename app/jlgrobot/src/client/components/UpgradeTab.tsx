import { Button, Form, Input, Modal, Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'
import { message } from 'antd'
import type { Device, UpgradeRecord } from '../types'
import { createUpgrade, listUpgrades } from '../platform/api-client'
import { UpgradeStatusTag } from './StatusTag'

export function UpgradeTab({ device }: { device: Device }) {
  const [upgrades, setUpgrades] = useState<UpgradeRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<{ target_version: string }>()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listUpgrades(device.id)
      .then((res) => {
        if (!cancelled) setUpgrades(res.upgrades)
      })
      .catch((err) => {
        if (!cancelled) message.error(err instanceof Error ? err.message : '加载升级记录失败')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [device.id])

  async function reload() {
    const res = await listUpgrades(device.id)
    setUpgrades(res.upgrades)
  }

  async function handleOk() {
    const values = await form.validateFields()
    await createUpgrade(device.id, { target_version: values.target_version.trim() })
    message.success('已发起远程升级')
    setOpen(false)
    await reload()
  }

  const columns: ColumnsType<UpgradeRecord> = [
    { title: '目标版本', dataIndex: 'target_version', key: 'target_version' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (s: string) => <UpgradeStatusTag status={s} /> },
    { title: '结果', dataIndex: 'result', key: 'result', ellipsis: true, render: (v: string | null) => v ?? '—' },
    { title: '发起时间', dataIndex: 'created_at', key: 'created_at', width: 200 },
    { title: '完成时间', dataIndex: 'completed_at', key: 'completed_at', width: 200, render: (v: string | null) => v ?? '—' },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Button type="primary" onClick={() => setOpen(true)}>
        发起远程升级
      </Button>
      <Table<UpgradeRecord>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={upgrades}
        columns={columns}
        pagination={false}
        locale={{ emptyText: '暂无升级记录' }}
      />
      <Modal title="发起远程升级" open={open} onCancel={() => setOpen(false)} onOk={handleOk} okText="发起" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="target_version" label="目标版本" rules={[{ required: true, message: '请输入目标升级版本' }]}>
            <Input placeholder="如：v2.3.0" maxLength={64} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
