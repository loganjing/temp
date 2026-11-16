// 设备状态变更操作下拉
import { Button, Dropdown, type MenuProps } from 'antd'
import { DownOutlined } from '@ant-design/icons'
import type { DeviceStatus } from '../types'

const statusOptions: { value: DeviceStatus; label: string }[] = [
  { value: 'running', label: '运行中' },
  { value: 'idle', label: '空闲' },
  { value: 'fault', label: '故障' },
  { value: 'offline', label: '离线' },
]

export function StatusChangeMenu({
  current,
  onChange,
}: {
  current: DeviceStatus
  onChange: (status: DeviceStatus) => void
}) {
  const items: MenuProps['items'] = statusOptions
    .filter((o) => o.value !== current)
    .map((o) => ({ key: o.value, label: o.label, onClick: () => onChange(o.value) }))

  return (
    <Dropdown menu={{ items }} trigger={['click']}>
      <Button size="small">
        变更状态 <DownOutlined />
      </Button>
    </Dropdown>
  )
}
