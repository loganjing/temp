// 设备状态色标签组件
import { Tag } from 'antd'
import type { DeviceStatus } from '../types'

const statusConfig: Record<DeviceStatus, { color: string; text: string }> = {
  running: { color: 'green', text: '运行中' },
  idle: { color: 'default', text: '空闲' },
  fault: { color: 'red', text: '故障' },
  offline: { color: 'default', text: '离线' },
}

export function StatusTag({ status }: { status: DeviceStatus }) {
  const config = statusConfig[status] ?? statusConfig.idle
  return <Tag color={config.color}>{config.text}</Tag>
}
