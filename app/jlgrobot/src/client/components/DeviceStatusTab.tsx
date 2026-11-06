import { Button, Descriptions, Select, Space } from 'antd'
import { useState } from 'react'
import { message } from 'antd'
import type { Device } from '../types'
import { DEVICE_STATUSES } from '../types'
import { updateDeviceStatus } from '../platform/api-client'
import { DeviceStatusTag } from './StatusTag'

const STATUS_OPTIONS = DEVICE_STATUSES.map((s) => ({ value: s, label: s }))

export function DeviceStatusTab({
  device,
  onUpdated,
}: {
  device: Device
  onUpdated: (device: Device) => void
}) {
  const [status, setStatus] = useState<string>(device.current_status)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!status.trim()) {
      message.error('请选择设备状态')
      return
    }
    setSaving(true)
    try {
      const updated = await updateDeviceStatus(device.id, status)
      message.success('设备状态已更新')
      onUpdated(updated)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '状态更新失败'
      message.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Descriptions title="当前状态" column={1} bordered size="small">
        <Descriptions.Item label="设备名称">{device.name}</Descriptions.Item>
        <Descriptions.Item label="设备型号">{device.model ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="当前状态">
          <DeviceStatusTag status={device.current_status} />
        </Descriptions.Item>
        <Descriptions.Item label="创建时间">{device.created_at}</Descriptions.Item>
        <Descriptions.Item label="更新时间">{device.updated_at}</Descriptions.Item>
      </Descriptions>
      <Space>
        <span>更新状态：</span>
        <Select
          style={{ width: 160 }}
          value={status}
          options={STATUS_OPTIONS}
          onChange={setStatus}
        />
        <Button type="primary" loading={saving} onClick={handleSave}>
          保存状态
        </Button>
      </Space>
    </Space>
  )
}
