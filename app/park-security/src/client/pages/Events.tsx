import { useCallback, useEffect, useState } from 'react'
import { Button, Descriptions, Select, Space, Spin, Table, message } from 'antd'
import { VideoCameraOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import {
  listEvents, recognizeEvent, listVideoSources, reportError,
  type EventRecord, type VideoSource,
} from '../platform/api-client'
import { DetailDrawer, DetailField } from '../components/DetailDrawer'

export default function Events() {
  const [events, setEvents] = useState<EventRecord[]>([])
  const [videoSources, setVideoSources] = useState<VideoSource[]>([])
  const [loading, setLoading] = useState(false)
  const [recognizing, setRecognizing] = useState(false)
  const [filterSource, setFilterSource] = useState<string | undefined>(undefined)
  const [selected, setSelected] = useState<EventRecord | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setEvents(await listEvents(filterSource))
    } catch (e) {
      reportError(e, '加载事件列表失败')
    } finally {
      setLoading(false)
    }
  }, [filterSource])

  const loadSources = useCallback(async () => {
    try {
      setVideoSources(await listVideoSources())
    } catch (e) {
      reportError(e, '加载视频源列表失败')
    }
  }, [])

  useEffect(() => { void loadSources() }, [loadSources])
  useEffect(() => { void load() }, [load])

  async function onRecognize() {
    setRecognizing(true)
    try {
      const event = await recognizeEvent()
      message.success(`已识别事件：${event.eventType}（来源：${event.videoSourceName}）`)
      await load()
    } catch (e) {
      reportError(e, '触发识别失败')
    } finally {
      setRecognizing(false)
    }
  }

  function showDetail(record: EventRecord) {
    setSelected(record)
    setDrawerOpen(true)
  }

  const columns: ColumnsType<EventRecord> = [
    { title: '事件类型', dataIndex: 'eventType', key: 'eventType' },
    { title: '视频来源', dataIndex: 'videoSourceName', key: 'videoSourceName' },
    { title: '发生时间', dataIndex: 'occurredAt', key: 'occurredAt', width: 200 },
    { title: '记录时间', dataIndex: 'createdAt', key: 'createdAt', width: 200 },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button type="primary" icon={<VideoCameraOutlined />} loading={recognizing} onClick={onRecognize}>
            触发识别
          </Button>
          <Select
            allowClear
            placeholder="按视频源筛选"
            style={{ width: 200 }}
            value={filterSource}
            onChange={setFilterSource}
            options={videoSources.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Space>
      </div>
      <Spin spinning={loading}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={events}
          locale={{ emptyText: '暂无事件记录' }}
          onRow={(r) => ({ onClick: () => showDetail(r), style: { cursor: 'pointer' } })}
        />
      </Spin>
      <DetailDrawer open={drawerOpen} title="事件详情" onClose={() => setDrawerOpen(false)}>
        {selected && (
          <Descriptions column={1} bordered size="small">
            <DetailField label="事件ID">{selected.id}</DetailField>
            <DetailField label="事件类型">{selected.eventType}</DetailField>
            <DetailField label="视频来源">{selected.videoSourceName}</DetailField>
            <DetailField label="视频源ID">{selected.videoSourceId}</DetailField>
            <DetailField label="发生时间">{selected.occurredAt}</DetailField>
            <DetailField label="记录时间">{selected.createdAt}</DetailField>
          </Descriptions>
        )}
      </DetailDrawer>
    </div>
  )
}
