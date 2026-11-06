import type {
  Device,
  DeviceHistory,
  DeviceListResponse,
  FaultDiagnosis,
  FaultListResponse,
  RepairOrder,
  UpgradeListResponse,
  UpgradeRecord,
  WorkOrderListResponse,
} from '../types'

/**
 * API 错误，统一解码自 `{ error: { code, message } }` 响应体。
 */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { Accept: 'application/json', ...(options?.body ? { 'Content-Type': 'application/json' } : {}) },
    ...options,
  })

  if (response.status === 204) return undefined as T

  const data: unknown = await response.json().catch(() => undefined)

  if (response.ok) return data as T

  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined
  const error = body?.error
  const detail = error && typeof error === 'object' ? (error as Record<string, unknown>) : undefined
  throw new ApiRequestError(
    typeof detail?.message === 'string' ? detail.message : typeof error === 'string' ? error : `HTTP ${response.status}`,
    response.status,
    typeof detail?.code === 'string' ? detail.code : undefined,
  )
}

function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

function patchJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return apiRequest<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
}

// —— 设备管理（technical-contract.md 2.1）——

export function listDevices(): Promise<DeviceListResponse> {
  return apiRequest<DeviceListResponse>('/api/devices')
}

export function getDevice(id: string): Promise<Device> {
  return apiRequest<Device>(`/api/devices/${encodeURIComponent(id)}`)
}

export function createDevice(body: { name: string; model?: string | null; current_status?: string }): Promise<Device> {
  return postJson<Device>('/api/devices', body)
}

export function updateDeviceStatus(id: string, current_status: string): Promise<Device> {
  return patchJson<Device>(`/api/devices/${encodeURIComponent(id)}/status`, { current_status })
}

// —— 故障诊断（technical-contract.md 2.2）——

export function listFaults(deviceId: string): Promise<FaultListResponse> {
  return apiRequest<FaultListResponse>(`/api/devices/${encodeURIComponent(deviceId)}/faults`)
}

export function createFault(
  deviceId: string,
  body: { fault_description: string; diagnosis_result?: string | null },
): Promise<FaultDiagnosis> {
  return postJson<FaultDiagnosis>(`/api/devices/${encodeURIComponent(deviceId)}/faults`, body)
}

// —— 远程升级（technical-contract.md 2.3）——

export function listUpgrades(deviceId: string): Promise<UpgradeListResponse> {
  return apiRequest<UpgradeListResponse>(`/api/devices/${encodeURIComponent(deviceId)}/upgrades`)
}

export function createUpgrade(deviceId: string, body: { target_version: string }): Promise<UpgradeRecord> {
  return postJson<UpgradeRecord>(`/api/devices/${encodeURIComponent(deviceId)}/upgrades`, body)
}

// —— 维修工单（technical-contract.md 2.4）——

export function listWorkOrders(deviceId: string): Promise<WorkOrderListResponse> {
  return apiRequest<WorkOrderListResponse>(`/api/devices/${encodeURIComponent(deviceId)}/work-orders`)
}

export function createWorkOrder(
  deviceId: string,
  body: { content: string; result?: string | null },
): Promise<RepairOrder> {
  return postJson<RepairOrder>(`/api/devices/${encodeURIComponent(deviceId)}/work-orders`, body)
}

// —— 设备履历（technical-contract.md 2.5）——

export function getDeviceHistory(deviceId: string): Promise<DeviceHistory> {
  return apiRequest<DeviceHistory>(`/api/devices/${encodeURIComponent(deviceId)}/history`)
}
