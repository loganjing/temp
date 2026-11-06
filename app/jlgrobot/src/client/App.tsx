import { useCallback, useEffect, useMemo, useState } from 'react'
import { Empty, Layout, message, Tabs, Typography } from 'antd'
import { listDevices } from './platform/api-client'
import type { Device } from './types'
import { DeviceListPanel } from './components/DeviceListPanel'
import { CreateDeviceModal } from './components/CreateDeviceModal'
import { DeviceStatusTab } from './components/DeviceStatusTab'
import { FaultDiagnosisTab } from './components/FaultDiagnosisTab'
import { UpgradeTab } from './components/UpgradeTab'
import { WorkOrderTab } from './components/WorkOrderTab'
import { HistoryTab } from './components/HistoryTab'
import { DeviceStatusTag } from './components/StatusTag'

const { Sider, Content } = Layout
const { Title, Text } = Typography

export default function App() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const loadDevices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listDevices()
      setDevices(res.devices)
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载设备列表失败')
      setDevices([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDevices()
  }, [loadDevices])

  const selected = useMemo(() => devices.find((d) => d.id === selectedId) ?? null, [devices, selectedId])

  function handleSelect(device: Device) {
    setSelectedId(device.id)
  }

  function handleDeviceUpdated(updated: Device) {
    setDevices((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
    setSelectedId(updated.id)
  }

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider
        theme="dark"
        width={300}
        breakpoint="lg"
        style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <DeviceListPanel
          devices={devices}
          loading={loading}
          selectedId={selectedId}
          onSelect={handleSelect}
          onRefresh={loadDevices}
          onCreateClick={() => setCreateOpen(true)}
        />
      </Sider>
      <Layout>
        <Content style={{ padding: 24, overflow: 'auto' }}>
          {!selected ? (
            <Empty description="请从左侧选择设备" style={{ marginTop: 64 }} />
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <Title level={4} style={{ marginBottom: 4 }}>
                  {selected.name}
                </Title>
                <Text type="secondary">
                  型号：{selected.model ?? '—'}　当前状态：
                  <DeviceStatusTag status={selected.current_status} />
                </Text>
              </div>
              <Tabs
                defaultActiveKey="status"
                items={[
                  {
                    key: 'status',
                    label: '设备状态监测',
                    children: <DeviceStatusTab device={selected} onUpdated={handleDeviceUpdated} />,
                  },
                  {
                    key: 'faults',
                    label: '故障诊断',
                    children: <FaultDiagnosisTab device={selected} />,
                  },
                  {
                    key: 'upgrades',
                    label: '远程升级',
                    children: <UpgradeTab device={selected} />,
                  },
                  {
                    key: 'work-orders',
                    label: '维修工单',
                    children: <WorkOrderTab device={selected} />,
                  },
                  {
                    key: 'history',
                    label: '设备履历',
                    children: <HistoryTab device={selected} />,
                  },
                ]}
              />
            </>
          )}
        </Content>
      </Layout>
      <CreateDeviceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false)
          message.success('设备已创建')
          loadDevices()
        }}
      />
    </Layout>
  )
}
