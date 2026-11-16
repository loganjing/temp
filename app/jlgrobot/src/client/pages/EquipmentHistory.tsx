// M5 设备履历 — 按设备筛选的时间轴列表，按时间降序
import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Empty, Space, Spin, Timeline, Typography, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { listEquipmentHistory } from '../api'
import type { EquipmentHistoryEvent, HistoryEventType } from '../types'
import { DeviceSelect } from '../components/DeviceSelect'

const { Title, Text } = Typography

const eventTypeLabel: Record<HistoryEventType, string> = {
  status_change: '状态变更',
  fault_diagnosis: '故障诊断',
  remote_upgrade: '远程升级',
  maintenance_order: '维修工单',
}

const eventTypeColor: Record<HistoryEventType, string> = {
  status_change: 'blue',
  fault_diagnosis: 'red',
  remote_upgrade: 'orange',
  maintenance_order: 'green',
}

export function EquipmentHistoryPage() {
  const [deviceId, setDeviceId] = useState<string | undefined>()
  const [events, setEvents] = useState<EquipmentHistoryEvent[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    if (!deviceId) {
      setEvents([])
      return
    }
    setLoading(true)
    listEquipmentHistory(deviceId)
      .then(setEvents)
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : '加载设备履历失败')
        setEvents([])
      })
      .finally(() => setLoading(false))
  }, [deviceId])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <Title level={4}>设备履历</Title>
      <Card>
        <Space style={{ marginBottom: 16 }}>
          <span>选择设备：</span>
          <DeviceSelect value={deviceId} onChange={(v) => setDeviceId(v)} />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            刷新
          </Button>
        </Space>
        <Spin spinning={loading}>
          {events.length > 0 ? (
            <Timeline
              items={events.map((e) => ({
                color: eventTypeColor[e.eventType] ?? 'gray',
                children: (
                  <div>
                    <Text strong>{eventTypeLabel[e.eventType] ?? e.eventType}</Text>
                    <br />
                    <Text type="secondary">{e.description}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(e.occurredAt).toLocaleString('zh-CN')}
                    </Text>
                  </div>
                ),
              }))}
            />
          ) : (
            <Empty description={deviceId ? '暂无履历记录' : '请选择设备查看履历'} />
          )}
        </Spin>
      </Card>
    </div>
  )
}
