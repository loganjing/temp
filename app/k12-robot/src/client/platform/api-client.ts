import type {
  Device,
  DeviceHistory,
  Fault,
  OnlineStatus,
  RepairOrder,
  RepairOrderStatus,
  RunningStatus,
  UpgradeStatus,
  UpgradeTask,
} from '../types'

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

// 服务端契约返回 camelCase 字段；此处对可能出现的 snake_case 做幂等归一化。
function camelCaseResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelCaseResponse)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
    key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
    camelCaseResponse(nested),
  ]))
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options)
  const data: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined)
  if (response.ok) return camelCaseResponse(data) as T

  const body = data && typeof data === 'object' ? data as Record<string, unknown> : undefined
  const error = body?.error
  const detail = error && typeof error === 'object' ? error as Record<string, unknown> : undefined
  throw new ApiRequestError(
    typeof detail?.message === 'string' ? detail.message : typeof error === 'string' ? error : `HTTP ${response.status}`,
    response.status,
    typeof detail?.code === 'string' ? detail.code : undefined,
  )
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

function postJson<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) })
}

function patchJson<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) })
}

// 设备模块
export const devicesApi = {
  list: () => apiRequest<Device[]>('/api/devices'),
  get: (id: string) => apiRequest<Device>(`/api/devices/${encodeURIComponent(id)}`),
  register: (body: { name: string; model?: string }) =>
    postJson<Device>('/api/devices', body),
  updateStatus: (id: string, body: { onlineStatus: OnlineStatus; runningStatus: RunningStatus }) =>
    patchJson<Device>(`/api/devices/${encodeURIComponent(id)}/status`, body),
}

// 故障模块
export const faultsApi = {
  list: (deviceId?: string) =>
    apiRequest<Fault[]>(deviceId ? `/api/faults?deviceId=${encodeURIComponent(deviceId)}` : '/api/faults'),
  record: (body: { deviceId: string; description: string; occurredAt: string }) =>
    postJson<Fault>('/api/faults', body),
}

// 升级模块
export const upgradesApi = {
  list: (deviceId?: string) =>
    apiRequest<UpgradeTask[]>(deviceId ? `/api/upgrades?deviceId=${encodeURIComponent(deviceId)}` : '/api/upgrades'),
  create: (body: { deviceId: string }) =>
    postJson<UpgradeTask>('/api/upgrades', body),
  advance: (id: string, body: { status: UpgradeStatus; result?: string }) =>
    patchJson<UpgradeTask>(`/api/upgrades/${encodeURIComponent(id)}/status`, body),
}

// 维修工单模块
export const repairOrdersApi = {
  list: (status?: RepairOrderStatus) =>
    apiRequest<RepairOrder[]>(status ? `/api/repair-orders?status=${status}` : '/api/repair-orders'),
  create: (body: { deviceId: string; faultId?: string; description: string; requirement?: string }) =>
    postJson<RepairOrder>('/api/repair-orders', body),
  advance: (id: string, body: { status: RepairOrderStatus; result?: string }) =>
    patchJson<RepairOrder>(`/api/repair-orders/${encodeURIComponent(id)}/status`, body),
}

// 设备履历模块
export const historyApi = {
  get: (id: string) =>
    apiRequest<DeviceHistory>(`/api/devices/${encodeURIComponent(id)}/history`),
}
