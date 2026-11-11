import { useEffect, useState } from 'react'
import { Card, Empty, Select, Spin, Tag, Timeline } from 'antd'
import { useAsync } from '../components/hooks'
import { formatDateTime } from '../components/format'
import { fetchEquipmentList, fetchEquipmentHistory } from '../platform/resources'
import { statusLabel } from '../components/StatusTag'
import type { HistoryEvent } from '../../shared/contracts'
import { useT } from '../platform/i18n'

const EVENT_LABELS: Record<HistoryEvent['type'], string> = {
  status: '状态变更',
  fault: '故障事件',
  upgrade: '升级任务',
  work_order: '维修工单',
}

const EVENT_COLORS: Record<HistoryEvent['type'], string> = {
  status: 'blue',
  fault: 'red',
  upgrade: 'purple',
  work_order: 'gold',
}

function eventSummary(e: HistoryEvent): string {
  switch (e.type) {
    case 'status':
      return statusLabel(e.status)
    case 'fault':
      return e.description
    case 'upgrade':
      return e.package_id
    case 'work_order':
      return e.description
  }
}

export default function EquipmentHistoryPage() {
  const t = useT()
  const [equipmentId, setEquipmentId] = useState<string | null>(null)
  const equipment = useAsync(() => fetchEquipmentList(), [])
  const history = useAsync(
    () => (equipmentId ? fetchEquipmentHistory(equipmentId) : Promise.resolve({ equipment_id: '', events: [] })),
    [equipmentId],
  )

  useEffect(() => {
    if (!equipmentId && equipment.data?.items.length) setEquipmentId(equipment.data.items[0].id)
  }, [equipment.data, equipmentId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card size="small">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>{t('common.equipment')}</span>
          <Select
            style={{ width: 320 }}
            value={equipmentId ?? undefined}
            onChange={setEquipmentId}
            loading={equipment.loading}
            placeholder={t('common.equipment')}
            options={(equipment.data?.items ?? []).map((e) => ({
              value: e.id,
              label: `${e.name}（${e.identifier}）`,
            }))}
          />
        </div>
      </Card>

      <Card size="small">
        {history.loading ? (
          <Spin />
        ) : history.data?.events.length ? (
          <Timeline
            items={history.data.events.map((e) => ({
              color: EVENT_COLORS[e.type],
              children: (
                <div>
                  <Tag color={EVENT_COLORS[e.type]}>{EVENT_LABELS[e.type]}</Tag>
                  <span style={{ marginLeft: 8 }}>{eventSummary(e)}</span>
                  {e.type === 'status' || e.type === 'fault' || e.type === 'upgrade' || e.type === 'work_order' ? (
                    <Tag style={{ marginLeft: 8 }} color={EVENT_COLORS[e.type]}>
                      {statusLabel(e.status)}
                    </Tag>
                  ) : null}
                  <span style={{ marginLeft: 12, color: 'var(--app-text-secondary)', fontSize: 12 }}>
                    {formatDateTime(e.timestamp)}
                  </span>
                </div>
              ),
            }))}
          />
        ) : (
          <Empty description={t('state.empty')} />
        )}
      </Card>
    </div>
  )
}
