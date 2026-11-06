import { Card, Empty, Skeleton, Tag, Timeline, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { message } from 'antd'
import type { Device, DeviceHistory, HistoryEventType } from '../types'
import { getDeviceHistory } from '../platform/api-client'
import { DeviceStatusTag } from './StatusTag'

const { Text } = Typography

const EVENT_TYPE_COLOR: Record<HistoryEventType, string> = {
  fault: 'red',
  upgrade: 'blue',
  work_order: 'gold',
  status: 'green',
}

const EVENT_TYPE_LABEL: Record<HistoryEventType, string> = {
  fault: '故障诊断',
  upgrade: '远程升级',
  work_order: '维修工单',
  status: '状态变更',
}

export function HistoryTab({ device }: { device: Device }) {
  const [history, setHistory] = useState<DeviceHistory | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getDeviceHistory(device.id)
      .then((res) => {
        if (!cancelled) setHistory(res)
      })
      .catch((err) => {
        if (!cancelled) {
          message.error(err instanceof Error ? err.message : '加载设备履历失败')
          setHistory(null)
        }
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [device.id])

  if (loading) return <Skeleton active />
  if (!history || history.events.length === 0) {
    return <Empty description="暂无履历事件" />
  }

  return (
    <Card size="small" title={<span>当前状态：<DeviceStatusTag status={history.device.current_status} /></span>}>
      <Timeline
        items={history.events.map((event) => ({
          color: EVENT_TYPE_COLOR[event.event_type] ?? 'gray',
          children: (
            <div>
              <Tag style={{ marginRight: 8 }}>{EVENT_TYPE_LABEL[event.event_type] ?? event.event_type}</Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>{event.timestamp}</Text>
              <div style={{ marginTop: 4 }}>{event.summary}</div>
            </div>
          ),
        }))}
      />
    </Card>
  )
}
