import { useCallback, useEffect, useState } from 'react'
import { Descriptions, Select, Spin, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  listTrails, reportError,
  type EventTrail, type TrailOperationType,
} from '../platform/api-client'
import { DetailDrawer, DetailField } from '../components/DetailDrawer'

const operationTypeOptions: { value: TrailOperationType; label: string }[] = [
  { value: 'event_created', label: '事件产生' },
  { value: 'alert_created', label: '告警生成' },
  { value: 'alert_confirmed', label: '告警确认' },
  { value: 'alert_completed', label: '告警完成' },
]

const operationLabel: Record<TrailOperationType, string> = {
  event_created: '事件产生',
  alert_created: '告警生成',
  alert_confirmed: '告警确认',
  alert_completed: '告警完成',
}

export default function Trails() {
  const [trails, setTrails] = useState<EventTrail[]>([])
  const [loading, setLoading] = useState(false)
  const [filterType, setFilterType] = useState<TrailOperationType | undefined>(undefined)
  const [selected, setSelected] = useState<EventTrail | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTrails(await listTrails(filterType))
    } catch (e) {
      reportError(e, '加载留痕记录失败')
    } finally {
      setLoading(false)
    }
  }, [filterType])

  useEffect(() => { void load() }, [load])

  function showDetail(record: EventTrail) {
    setSelected(record)
    setDrawerOpen(true)
  }

  const columns: ColumnsType<EventTrail> = [
    {
      title: '操作类型', dataIndex: 'operationType', key: 'operationType', width: 120,
      render: (t: TrailOperationType) => operationLabel[t] ?? t,
    },
    { title: '业务对象类型', dataIndex: 'businessObjectType', key: 'businessObjectType', width: 140 },
    { title: '业务对象ID', dataIndex: 'businessObjectId', key: 'businessObjectId', ellipsis: true },
    { title: '操作时间', dataIndex: 'operationTime', key: 'operationTime', width: 200 },
    { title: '说明', dataIndex: 'detail', key: 'detail', ellipsis: true },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="按操作类型筛选"
          style={{ width: 200 }}
          value={filterType}
          onChange={setFilterType}
          options={operationTypeOptions}
        />
      </div>
      <Spin spinning={loading}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={trails}
          locale={{ emptyText: '暂无留痕记录' }}
          onRow={(r) => ({ onClick: () => showDetail(r), style: { cursor: 'pointer' } })}
        />
      </Spin>
      <DetailDrawer open={drawerOpen} title="留痕详情" onClose={() => setDrawerOpen(false)}>
        {selected && (
          <Descriptions column={1} bordered size="small">
            <DetailField label="留痕ID">{selected.id}</DetailField>
            <DetailField label="操作类型">{operationLabel[selected.operationType] ?? selected.operationType}</DetailField>
            <DetailField label="业务对象类型">{selected.businessObjectType}</DetailField>
            <DetailField label="业务对象ID">{selected.businessObjectId}</DetailField>
            <DetailField label="操作时间">{selected.operationTime}</DetailField>
            <DetailField label="说明">{selected.detail ?? '—'}</DetailField>
            <DetailField label="记录时间">{selected.createdAt}</DetailField>
          </Descriptions>
        )}
      </DetailDrawer>
    </div>
  )
}
