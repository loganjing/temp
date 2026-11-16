// 各模块 API 调用封装 — 基于 src/client/platform/api-client.ts
import { apiRequest } from './platform/api-client'
import type {
  Device,
  DeviceStatus,
  EquipmentHistoryEvent,
  FaultDiagnosis,
  MaintenanceOrder,
  MaintenanceOrderStatus,
  UpgradeTask,
  UpgradeTaskStatus,
} from './types'

// --- 设备接口 ---

export function listDevices(): Promise<Device[]> {
  return apiRequest<Device[]>('/api/devices')
}

export function getDevice(id: string): Promise<Device> {
  return apiRequest<Device>(`/api/devices/${id}`)
}

export function updateDeviceStatus(id: string, status: DeviceStatus): Promise<Device> {
  return apiRequest<Device>(`/api/devices/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
}

// --- 故障诊断接口 ---

export function createFaultDiagnosis(deviceId: string, description: string): Promise<FaultDiagnosis> {
  return apiRequest<FaultDiagnosis>(`/api/devices/${deviceId}/fault-diagnoses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  })
}

export function listFaultDiagnoses(deviceId: string): Promise<FaultDiagnosis[]> {
  return apiRequest<FaultDiagnosis[]>(`/api/devices/${deviceId}/fault-diagnoses`)
}

// --- 远程升级接口 ---

export function createUpgradeTask(deviceId: string, packageId: string): Promise<UpgradeTask> {
  return apiRequest<UpgradeTask>(`/api/devices/${deviceId}/upgrade-tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packageId }),
  })
}

export function listUpgradeTasks(deviceId: string): Promise<UpgradeTask[]> {
  return apiRequest<UpgradeTask[]>(`/api/devices/${deviceId}/upgrade-tasks`)
}

export function updateUpgradeTaskStatus(id: string, status: UpgradeTaskStatus): Promise<UpgradeTask> {
  return apiRequest<UpgradeTask>(`/api/upgrade-tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
}

// --- 维修工单接口 ---

export function createMaintenanceOrder(
  deviceId: string,
  faultDescription: string,
  technician: string | null,
): Promise<MaintenanceOrder> {
  return apiRequest<MaintenanceOrder>('/api/maintenance-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, faultDescription, technician }),
  })
}

export function listMaintenanceOrders(deviceId?: string): Promise<MaintenanceOrder[]> {
  const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : ''
  return apiRequest<MaintenanceOrder[]>(`/api/maintenance-orders${query}`)
}

export function getMaintenanceOrder(id: string): Promise<MaintenanceOrder> {
  return apiRequest<MaintenanceOrder>(`/api/maintenance-orders/${id}`)
}

export function updateMaintenanceOrderStatus(id: string, status: MaintenanceOrderStatus): Promise<MaintenanceOrder> {
  return apiRequest<MaintenanceOrder>(`/api/maintenance-orders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
}

// --- 设备履历接口 ---

export function listEquipmentHistory(deviceId: string): Promise<EquipmentHistoryEvent[]> {
  return apiRequest<EquipmentHistoryEvent[]>(`/api/devices/${deviceId}/history`)
}
