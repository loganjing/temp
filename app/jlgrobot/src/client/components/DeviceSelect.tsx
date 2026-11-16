// 通用设备选择下拉 — 获取设备列表供表单选择
import { useEffect, useMemo, useState } from 'react'
import { Select } from 'antd'
import { listDevices } from '../api'
import type { Device } from '../types'

export function DeviceSelect({
  value,
  onChange,
  placeholder = '选择设备',
  allowClear,
}: {
  value?: string
  onChange?: (deviceId: string | undefined) => void
  placeholder?: string
  allowClear?: boolean
}) {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    listDevices()
      .then(setDevices)
      .catch(() => setDevices([]))
      .finally(() => setLoading(false))
  }, [])

  const options = useMemo(
    () => devices.map((d) => ({ value: d.id, label: `${d.name}（${d.identifier}）` })),
    [devices],
  )

  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      loading={loading}
      placeholder={placeholder}
      allowClear={allowClear}
      showSearch
      optionFilterProp="label"
    />
  )
}
