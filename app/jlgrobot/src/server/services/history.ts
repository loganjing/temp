import type { DbClient } from '@commonapp/dbkit'
import type {
  HistoryEvent,
  EquipmentStatusValue,
  FaultStatus,
  UpgradeStatus,
  WorkOrderStatus,
} from '../../shared/contracts'

interface StatusRow {
  id: string
  status: string
  params: string | null
  recorded_at: string
}
interface FaultRow {
  id: string
  description: string
  status: string
  created_at: string
}
interface UpgradeRow {
  id: string
  package_id: string
  status: string
  created_at: string
}
interface WorkOrderRow {
  id: string
  description: string
  status: string
  created_at: string
}

/**
 * 设备履历聚合查询：按设备汇聚其状态、故障、升级、工单已持久化数据，
 * 各取 recorded_at/created_at 为时间戳，合并为统一 events 数组并按时间倒序排列。
 */
export async function getEquipmentHistory(db: DbClient, equipmentId: string): Promise<HistoryEvent[]> {
  const [statuses, faults, upgrades, workOrders] = await Promise.all([
    db.queryAll<StatusRow>({
      text: 'SELECT id, status, params, recorded_at FROM equipment_status WHERE equipment_id = ? ORDER BY recorded_at DESC',
      params: [equipmentId],
    }),
    db.queryAll<FaultRow>({
      text: 'SELECT id, description, status, created_at FROM faults WHERE equipment_id = ? ORDER BY created_at DESC',
      params: [equipmentId],
    }),
    db.queryAll<UpgradeRow>({
      text: 'SELECT id, package_id, status, created_at FROM upgrade_tasks WHERE equipment_id = ? ORDER BY created_at DESC',
      params: [equipmentId],
    }),
    db.queryAll<WorkOrderRow>({
      text: 'SELECT id, description, status, created_at FROM work_orders WHERE equipment_id = ? ORDER BY created_at DESC',
      params: [equipmentId],
    }),
  ])

  const events: HistoryEvent[] = []
  for (const row of statuses) {
    events.push({
      type: 'status',
      id: row.id,
      status: row.status as EquipmentStatusValue,
      params: row.params ? JSON.parse(row.params) : null,
      timestamp: row.recorded_at,
    })
  }
  for (const row of faults) {
    events.push({
      type: 'fault',
      id: row.id,
      description: row.description,
      status: row.status as FaultStatus,
      timestamp: row.created_at,
    })
  }
  for (const row of upgrades) {
    events.push({
      type: 'upgrade',
      id: row.id,
      package_id: row.package_id,
      status: row.status as UpgradeStatus,
      timestamp: row.created_at,
    })
  }
  for (const row of workOrders) {
    events.push({
      type: 'work_order',
      id: row.id,
      description: row.description,
      status: row.status as WorkOrderStatus,
      timestamp: row.created_at,
    })
  }

  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return events
}
