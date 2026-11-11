import { useMemo, useState } from 'react'
import { Card, Empty, Select, Skeleton, Timeline, Typography, message } from 'antd'
import { DesktopOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { devicesApi, historyApi } from '../platform/api-client'
import { ApiRequestError } from '../platform/api-client'
import { useAsync } from '../hooks/useAsync'
import type { DeviceHistory, TimelineType } from '../types'
import { timelineTypeColor, timelineTypeLabel } from '../constants'
import { ErrorView } from '../components/StateViews'

const { Title, Text, Paragraph } = Typography

export default function DeviceHistoryPage() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined)
  const { data: devices } = useAsync(() => devicesApi.list())
  const { data, loading, error, reload } = useAsync(
    () => (selectedDeviceId ? historyApi.get(selectedDeviceId) : Promise.resolve(undefined as DeviceHistory | undefined)),
    [selectedDeviceId],
  )

  const deviceOptions = useMemo(
    () => (devices ?? []).map((d) => ({ value: d.id, label: d.name })),
    [devices],
  )

  function copyError(err: unknown) {
    if (err instanceof ApiRequestError) message.error(err.message)
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>设备履历</Title>
        <Select
          showSearch
          placeholder="选择设备查看履历"
          style={{ width: 280 }}
          value={selectedDeviceId}
          options={deviceOptions}
          optionFilterProp="label"
          onChange={(v) => {
            setSelectedDeviceId(v ?? undefined)
            copyError(undefined)
          }}
        />
      </div>

      {!selectedDeviceId ? (
        <Card>
          <Empty description="请选择一台设备查看完整履历" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : loading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : error ? (
        <ErrorView error={error} onRetry={reload} />
      ) : !data ? (
        <Empty description="暂无履历数据" />
      ) : (
        <Card
          title={
            <span>
              <DesktopOutlined style={{ marginInlineEnd: 8 }} />
              {data.device.name}
              {data.device.model ? ` · ${data.device.model}` : ''}
            </span>
          }
          extra={<Text type="secondary">注册时间：{dayjs(data.device.registeredAt).format('YYYY-MM-DD HH:mm:ss')}</Text>}
        >
          <Paragraph type="secondary" style={{ marginBottom: 24 }}>
            当前状态：
            <Text strong>{data.device.onlineStatus === 'online' ? '在线' : '离线'}</Text>
            {' · '}
            <Text strong>{runningLabel(data.device.runningStatus)}</Text>
            {data.device.isAbnormal ? ' · 异常' : ''}
          </Paragraph>
          {data.timeline.length === 0 ? (
            <Empty description="该设备暂无生命周期记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Timeline
              items={data.timeline.map((entry) => ({
                color: timelineTypeColor[entry.type as TimelineType] ?? 'blue',
                children: (
                  <div>
                    <Text strong>{timelineTypeLabel[entry.type as TimelineType] ?? entry.type}</Text>
                    <Text type="secondary" style={{ marginInlineStart: 8 }}>
                      {dayjs(entry.timestamp).format('YYYY-MM-DD HH:mm:ss')}
                    </Text>
                    <div style={{ marginTop: 4 }}>{entry.summary}</div>
                  </div>
                ),
              }))}
            />
          )}
        </Card>
      )}
    </>
  )
}

function runningLabel(status: DeviceHistory['device']['runningStatus']): string {
  switch (status) {
    case 'idle': return '空闲'
    case 'running': return '运行中'
    case 'error': return '异常'
    case 'maintenance': return '维护中'
    default: return status
  }
}
