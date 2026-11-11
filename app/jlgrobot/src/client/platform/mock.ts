// 集中化演示数据：仅在 API 不可达（后端未启动）时作为回退，
// 用于在不依赖后端运行的情况下验证页面与导航结构。
// 数据形态严格遵循 src/shared/contracts.ts，不发明 API 行为。

import type {
  Equipment,
  EquipmentStatus,
  Fault,
  FaultDetail,
  UpgradeTask,
  UpgradeTaskDetail,
  WorkOrder,
  WorkOrderDetail,
  EquipmentHistory,
} from '../../shared/contracts'

export const mockEquipment: Equipment[] = [
  { id: 'eq-001', name: '机器人-A01', identifier: 'JLG-A01', type: 'mobile-robot', created_at: '2026-11-11T08:00:00.000Z' },
  { id: 'eq-002', name: '机器人-B02', identifier: 'JLG-B02', type: 'mobile-robot', created_at: '2026-11-11T08:05:00.000Z' },
  { id: 'eq-003', name: '升降平台-C03', identifier: 'JLG-C03', type: 'lift-platform', created_at: '2026-11-11T08:10:00.000Z' },
]

const mockStatuses: Record<string, EquipmentStatus[]> = {
  'eq-001': [
    { id: 'es-1', equipment_id: 'eq-001', status: 'online', params: { battery: 100 }, recorded_at: '2026-11-11T08:00:00.000Z' },
    { id: 'es-2', equipment_id: 'eq-001', status: 'running', params: { battery: 85, speed: 1.2 }, recorded_at: '2026-11-11T08:30:00.000Z' },
  ],
  'eq-002': [
    { id: 'es-3', equipment_id: 'eq-002', status: 'offline', params: null, recorded_at: '2026-11-11T09:00:00.000Z' },
  ],
  'eq-003': [
    { id: 'es-4', equipment_id: 'eq-003', status: 'fault', params: { code: 'E04' }, recorded_at: '2026-11-11T09:10:00.000Z' },
  ],
}

const mockFaults: FaultDetail[] = [
  {
    id: 'ft-1', equipment_id: 'eq-001', description: '左轮电机过热', status: 'diagnosed',
    diagnosis: '电机轴承磨损导致摩擦过热', suggestion: '更换轴承组件',
    created_at: '2026-11-11T09:00:00.000Z', updated_at: '2026-11-11T10:00:00.000Z', closed_at: null,
    status_logs: [
      { id: 'fl-1', fault_id: 'ft-1', from_status: null, to_status: 'recorded', changed_at: '2026-11-11T09:00:00.000Z' },
      { id: 'fl-2', fault_id: 'ft-1', from_status: 'recorded', to_status: 'diagnosing', changed_at: '2026-11-11T09:30:00.000Z' },
      { id: 'fl-3', fault_id: 'ft-1', from_status: 'diagnosing', to_status: 'diagnosed', changed_at: '2026-11-11T10:00:00.000Z' },
    ],
  },
  {
    id: 'ft-2', equipment_id: 'eq-003', description: '液压系统压力异常', status: 'recorded',
    diagnosis: null, suggestion: null,
    created_at: '2026-11-11T11:00:00.000Z', updated_at: '2026-11-11T11:00:00.000Z', closed_at: null,
    status_logs: [
      { id: 'fl-4', fault_id: 'ft-2', from_status: null, to_status: 'recorded', changed_at: '2026-11-11T11:00:00.000Z' },
    ],
  },
]

const mockUpgrades: UpgradeTaskDetail[] = [
  {
    id: 'up-1', equipment_id: 'eq-001', package_id: 'firmware-v2.1.0', status: 'success',
    result: '升级完成，版本已更新至 v2.1.0', failure_reason: null,
    created_at: '2026-11-11T08:00:00.000Z', updated_at: '2026-11-11T08:15:00.000Z',
    status_logs: [
      { id: 'ul-1', task_id: 'up-1', from_status: null, to_status: 'pending', changed_at: '2026-11-11T08:00:00.000Z' },
      { id: 'ul-2', task_id: 'up-1', from_status: 'pending', to_status: 'executing', changed_at: '2026-11-11T08:05:00.000Z' },
      { id: 'ul-3', task_id: 'up-1', from_status: 'executing', to_status: 'success', changed_at: '2026-11-11T08:15:00.000Z' },
    ],
  },
  {
    id: 'up-2', equipment_id: 'eq-002', package_id: 'firmware-v2.1.0', status: 'pending',
    result: null, failure_reason: null,
    created_at: '2026-11-11T10:00:00.000Z', updated_at: '2026-11-11T10:00:00.000Z',
    status_logs: [
      { id: 'ul-4', task_id: 'up-2', from_status: null, to_status: 'pending', changed_at: '2026-11-11T10:00:00.000Z' },
    ],
  },
]

const mockWorkOrders: WorkOrderDetail[] = [
  {
    id: 'wo-1', equipment_id: 'eq-001', fault_id: 'ft-1', description: '更换左轮轴承', status: 'processing',
    created_at: '2026-11-11T09:30:00.000Z', updated_at: '2026-11-11T09:45:00.000Z', closed_at: null,
    records: [
      { id: 'wr-1', order_id: 'wo-1', content: '已拆解左轮组件', created_at: '2026-11-11T09:30:00.000Z' },
    ],
    status_logs: [
      { id: 'wl-1', order_id: 'wo-1', from_status: null, to_status: 'pending', changed_at: '2026-11-11T09:30:00.000Z' },
      { id: 'wl-2', order_id: 'wo-1', from_status: 'pending', to_status: 'processing', changed_at: '2026-11-11T09:45:00.000Z' },
    ],
  },
  {
    id: 'wo-2', equipment_id: 'eq-003', fault_id: null, description: '检查液压管路', status: 'pending',
    created_at: '2026-11-11T11:30:00.000Z', updated_at: '2026-11-11T11:30:00.000Z', closed_at: null,
    records: [],
    status_logs: [
      { id: 'wl-3', order_id: 'wo-2', from_status: null, to_status: 'pending', changed_at: '2026-11-11T11:30:00.000Z' },
    ],
  },
]

export function mockEquipmentList(keyword?: string): Equipment[] {
  const kw = keyword?.trim().toLowerCase()
  if (!kw) return mockEquipment
  return mockEquipment.filter(
    (e) => e.name.toLowerCase().includes(kw) || e.identifier.toLowerCase().includes(kw),
  )
}

export function mockEquipmentStatuses(equipmentId: string): EquipmentStatus[] {
  return mockStatuses[equipmentId] ?? []
}

export function mockFaultList(): Fault[] {
  return mockFaults.map(({ status_logs, ...rest }) => rest)
}

export function mockFaultDetail(id: string): FaultDetail | undefined {
  return mockFaults.find((f) => f.id === id)
}

export function mockUpgradeList(): UpgradeTask[] {
  return mockUpgrades.map(({ status_logs, ...rest }) => rest)
}

export function mockUpgradeDetail(id: string): UpgradeTaskDetail | undefined {
  return mockUpgrades.find((u) => u.id === id)
}

export function mockWorkOrderList(): WorkOrder[] {
  return mockWorkOrders.map(({ status_logs, records, ...rest }) => rest)
}

export function mockWorkOrderDetail(id: string): WorkOrderDetail | undefined {
  return mockWorkOrders.find((w) => w.id === id)
}

export function mockHistory(equipmentId: string): EquipmentHistory {
  const statuses = mockStatuses[equipmentId] ?? []
  const faults = mockFaults.filter((f) => f.equipment_id === equipmentId)
  const upgrades = mockUpgrades.filter((u) => u.equipment_id === equipmentId)
  const orders = mockWorkOrders.filter((w) => w.equipment_id === equipmentId)
  const events = [
    ...statuses.map((s) => ({ type: 'status' as const, id: s.id, status: s.status, params: s.params, timestamp: s.recorded_at })),
    ...faults.map((f) => ({ type: 'fault' as const, id: f.id, description: f.description, status: f.status, timestamp: f.created_at })),
    ...upgrades.map((u) => ({ type: 'upgrade' as const, id: u.id, package_id: u.package_id, status: u.status, timestamp: u.created_at })),
    ...orders.map((w) => ({ type: 'work_order' as const, id: w.id, description: w.description, status: w.status, timestamp: w.created_at })),
  ]
  events.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
  return { equipment_id: equipmentId, events }
}
