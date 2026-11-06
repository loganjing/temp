import { useCallback, useEffect, useState } from 'react'
import { Descriptions, Space, Spin, Table, Tabs, Tag, Timeline } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  listAlerts, getAlert, reportError,
  type Alert, type AlertDetail, type AlertStatus,
} from '../platform/api-client'
import { DetailDrawer, DetailField } from '../components/DetailDrawer'

const statusMap: Record<AlertStatus, { label: string; color: string }> = {
  pending: { label: '待处置', color: 'orange' },
  handling: { label: '处置中', color: 'blue' },
  handled: { label: '已处置', color: 'green' },
}

const actionLabel: Record<string, string> = {
  confirm: '确认接收',
  complete: '完成处置',
}

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<AlertStatus | 'all'>('all')
  const [selected, setSelected] = useState<AlertDetail | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const status = activeTab === 'all' ? undefined : activeTab
      setAlerts(await listAlerts(status))
    } catch (e) {
      reportError(e, '加载告警列表失败')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => { void load() }, [load])

  async function showDetail(record: Alert) {
    setDrawerOpen(true)
    setDetailLoading(true)
    try {
      setSelected(await getAlert(record.id))
    } catch (e) {
      reportError(e, '加载告警详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const columns: ColumnsType<Alert> = [
    { title: '事件类型', dataIndex: 'eventType', key: 'eventType' },
    { title: '视频来源', dataIndex: 'videoSourceName', key: 'videoSourceName' },
    { title: '告警时间', dataIndex: 'alertTime', key: 'alertTime', width: 200 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (s: AlertStatus) => <Tag color={statusMap[s].color}>{statusMap[s].label}</Tag>,
    },
    { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 200 },
  ]

  return (
    <div>
      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as AlertStatus | 'all')}
        items={[
          { key: 'all', label: '全部' },
          { key: 'pending', label: '待处置' },
          { key: 'handling', label: '处置中' },
          { key: 'handled', label: '已处置' },
        ]}
        style={{ marginBottom: 8 }}
      />
      <Spin spinning={loading}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={alerts}
          locale={{ emptyText: '暂无告警记录' }}
          onRow={(r) => ({ onClick: () => showDetail(r), style: { cursor: 'pointer' } })}
        />
      </Spin>
      <DetailDrawer open={drawerOpen} title="告警详情" onClose={() => { setDrawerOpen(false); setSelected(null) }}>
        <Spin spinning={detailLoading}>
          {selected && (
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Descriptions column={1} bordered size="small">
                <DetailField label="告警ID">{selected.id}</DetailField>
                <DetailField label="事件类型">{selected.eventType}</DetailField>
                <DetailField label="视频来源">{selected.videoSourceName}</DetailField>
                <DetailField label="关联事件ID">{selected.eventId}</DetailField>
                <DetailField label="事件发生时间">{selected.occurredAt}</DetailField>
                <DetailField label="告警时间">{selected.alertTime}</DetailField>
                <DetailField label="状态">
                  <Tag color={statusMap[selected.status].color}>{statusMap[selected.status].label}</Tag>
                </DetailField>
                <DetailField label="创建时间">{selected.createdAt}</DetailField>
                <DetailField label="更新时间">{selected.updatedAt}</DetailField>
              </Descriptions>
              <div>
                <h4 style={{ marginBottom: 12 }}>处置记录</h4>
                {selected.handlingRecords.length === 0 ? (
                  <span style={{ color: '#999' }}>暂无处置记录</span>
                ) : (
                  <Timeline
                    items={selected.handlingRecords.map((r) => ({
                      children: (
                        <div>
                          <div><strong>{actionLabel[r.action] ?? r.action}</strong> — {r.handler}</div>
                          {r.handlingResult && <div style={{ color: '#666' }}>{r.handlingResult}</div>}
                          <div style={{ color: '#999', fontSize: 12 }}>{r.handledAt}</div>
                        </div>
                      ),
                    }))}
                  />
                )}
              </div>
            </Space>
          )}
        </Spin>
      </DetailDrawer>
    </div>
  )
}
