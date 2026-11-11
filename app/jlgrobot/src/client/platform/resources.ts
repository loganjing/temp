// 类型化 API 资源函数：封装 api-client 调用，并在网络不可达时回退到演示数据。
// 仅对读取接口回退（用于无后端时验证页面与导航结构）；写入接口不回退，失败如实反馈。

import { apiGet, apiPost, apiPatch, type ListResponse } from './api-client'
import type {
  Equipment,
  EquipmentStatus,
  EquipmentStatusValue,
  Fault,
  FaultDetail,
  UpgradeTask,
  UpgradeTaskDetail,
  WorkOrder,
  WorkOrderDetail,
  EquipmentHistory,
} from '../../shared/contracts'
import {
  mockEquipmentList,
  mockEquipmentStatuses,
  mockFaultList,
  mockFaultDetail,
  mockUpgradeList,
  mockUpgradeDetail,
  mockWorkOrderList,
  mockWorkOrderDetail,
  mockHistory,
} from './mock'

async function withMock<T>(promise: Promise<T>, mock: T | (() => T)): Promise<T> {
  try {
    return await promise
  } catch (e) {
    if (e instanceof TypeError) {
      // 网络不可达：fetch 抛 TypeError → 回退演示数据
      return typeof mock === 'function' ? (mock as () => T)() : mock
    }
    throw e
  }
}

// 设备
export const fetchEquipmentList = (keyword?: string) =>
  withMock(
    apiGet<ListResponse<Equipment>>('/api/equipment', { keyword }),
    { items: mockEquipmentList(keyword) },
  )

export const fetchEquipmentStatuses = (equipmentId: string) =>
  withMock(
    apiGet<ListResponse<EquipmentStatus>>(`/api/equipment/${equipmentId}/status`, { limit: 50 }),
    { items: mockEquipmentStatuses(equipmentId) },
  )

export const recordEquipmentStatus = (equipmentId: string, status: EquipmentStatusValue, params?: Record<string, unknown>) =>
  apiPost<EquipmentStatus>(`/api/equipment/${equipmentId}/status`, { status, params })

// 故障
export const fetchFaultList = (params?: { equipment_id?: string; status?: string }) =>
  withMock(apiGet<ListResponse<Fault>>('/api/faults', params), { items: mockFaultList() })

export const fetchFaultDetail = (id: string) =>
  withMock(apiGet<FaultDetail>(`/api/faults/${id}`), () => mockFaultDetail(id))

export const updateFaultDiagnosis = (id: string, body: { diagnosis?: string; suggestion?: string }) =>
  apiPatch<Fault>(`/api/faults/${id}`, body)

export const advanceFaultStatus = (id: string, status: string) =>
  apiPost<Fault>(`/api/faults/${id}/status`, { status })

// 升级
export const fetchUpgradeList = (params?: { equipment_id?: string; status?: string }) =>
  withMock(apiGet<ListResponse<UpgradeTask>>('/api/upgrades', params), { items: mockUpgradeList() })

export const fetchUpgradeDetail = (id: string) =>
  withMock(apiGet<UpgradeTaskDetail>(`/api/upgrades/${id}`), () => mockUpgradeDetail(id))

export const createUpgradeTask = (equipmentId: string, packageId: string) =>
  apiPost<UpgradeTask>('/api/upgrades', { equipment_id: equipmentId, package_id: packageId })

export const advanceUpgradeStatus = (
  id: string,
  body: { status: string; result?: string; failure_reason?: string },
) => apiPost<UpgradeTask>(`/api/upgrades/${id}/status`, body)

// 工单
export const fetchWorkOrderList = (params?: { equipment_id?: string; status?: string }) =>
  withMock(apiGet<ListResponse<WorkOrder>>('/api/work-orders', params), { items: mockWorkOrderList() })

export const fetchWorkOrderDetail = (id: string) =>
  withMock(apiGet<WorkOrderDetail>(`/api/work-orders/${id}`), () => mockWorkOrderDetail(id))

export const createWorkOrder = (body: { equipment_id: string; fault_id?: string; description: string }) =>
  apiPost<WorkOrder>('/api/work-orders', body)

export const addWorkOrderRecord = (id: string, content: string) =>
  apiPost<{ id: string; order_id: string; content: string; created_at: string }>(`/api/work-orders/${id}/records`, { content })

export const advanceWorkOrderStatus = (id: string, status: string) =>
  apiPost<WorkOrder>(`/api/work-orders/${id}/status`, { status })

// 设备履历
export const fetchEquipmentHistory = (equipmentId: string) =>
  withMock(apiGet<EquipmentHistory>(`/api/equipment/${equipmentId}/history`), mockHistory(equipmentId))
