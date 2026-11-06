import { Button, Input, Space, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import { useMemo, useState } from 'react'
import type { Device } from '../types'
import { DeviceStatusTag } from './StatusTag'

const { Title } = Typography

export function DeviceListPanel({
  devices,
  loading,
  selectedId,
  onSelect,
  onRefresh,
  onCreateClick,
}: {
  devices: Device[]
  loading: boolean
  selectedId: string | null
  onSelect: (device: Device) => void
  onRefresh: () => void
  onCreateClick: () => void
}) {
  const [keyword, setKeyword] = useState('')

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return devices
    return devices.filter(
      (d) => d.name.toLowerCase().includes(kw) || (d.model ?? '').toLowerCase().includes(kw),
    )
  }, [devices, keyword])

  const columns: ColumnsType<Device> = [
    {
      title: '设备名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string) => <span style={{ color: 'inherit' }}>{name}</span>,
    },
    {
      title: '状态',
      dataIndex: 'current_status',
      key: 'current_status',
      width: 92,
      render: (status: string) => <DeviceStatusTag status={status} />,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 16px 8px' }}>
        <Title level={5} style={{ margin: 0, color: 'rgba(255,255,255,0.92)' }}>
          设备总览
        </Title>
        <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
          <Input.Search
            placeholder="搜索名称/型号"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            allowClear
          />
          <Button type="primary" icon={<PlusOutlined />} block onClick={onCreateClick}>
            新建设备
          </Button>
        </Space>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 12px' }}>
        <Table<Device>
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={filtered}
          columns={columns}
          pagination={false}
          showHeader={false}
          onRow={(record) => ({
            onClick: () => onSelect(record),
            style: { cursor: 'pointer' },
          })}
          rowClassName={(record) => (record.id === selectedId ? 'device-row-selected' : '')}
          locale={{ emptyText: '暂无设备' }}
        />
      </div>
    </div>
  )
}
