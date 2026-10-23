// 前端类型定义 — 基于技术契约 (technical-contract.md)
// 所有 INTEGER 主键在 API 响应中序列化为 string

// ── 枚举值 ──

export type TaskStatus = 'pending' | 'assigned' | 'in_transit' | 'completed' | 'cancelled' | 'error';
export type ResourceStatus = 'idle' | 'busy' | 'offline' | 'fault';
export type Priority = 'normal' | 'urgent' | 'highest';
export type AssignmentMethod = 'auto' | 'manual';
export type ConflictType = 'node' | 'oncoming' | 'tailgating';
export type YieldStrategy = 'priority_yield' | 'first_arrive' | 'detour';
export type ConflictStatus = 'active' | 'resolved';
export type EventType =
  | 'task_assigned'
  | 'route_planned'
  | 'device_departed'
  | 'position_update'
  | 'yield_paused'
  | 'yield_resumed'
  | 'route_replanned'
  | 'target_arrived'
  | 'anomaly'
  | 'task_completed'
  | 'task_cancelled';
export type ResourceType = 'agv' | 'forklift';
export type LocationType = 'storage' | 'transit';
export type StatisticsPeriod = 'day' | 'week' | 'month';
export type RecoverAction = 'resume' | 'cancel';

// ── 实体接口 ──

export interface Task {
  taskId: string;
  status: TaskStatus;
  sourceLocationCode: string;
  targetLocationCode: string;
  cargoName: string;
  cargoQuantity: number;
  priority: Priority;
  remark: string | null;
  createdBy: string;
  createdAt: string;
  assignedResourceId: string | null;
  assignedAt: string | null;
  assignmentMethod: AssignmentMethod | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
}

export interface TaskDetail extends Task {
  currentRoute: Route | null;
  recentEvents: ExecutionEvent[];
}

export interface TaskListResponse {
  tasks: Task[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Resource {
  resourceId: string;
  name: string;
  type: ResourceType;
  status: ResourceStatus;
  currentLocationCode: string | null;
  lastPositionAt: string | null;
  currentTaskId: string | null;
}

export interface ResourceListResponse {
  resources: Resource[];
}

export interface Location {
  locationCode: string;
  name: string;
  x: number;
  y: number;
  type: LocationType;
}

export interface LocationListResponse {
  locations: Location[];
}

export interface MapEdge {
  fromLocationCode: string;
  toLocationCode: string;
  distance: number;
  direction: 'bidirectional' | 'unidirectional';
}

export interface TopologyResponse {
  nodes: Location[];
  edges: MapEdge[];
}

export interface RouteNode {
  code: string;
  x: number;
  y: number;
  order: number;
}

export interface Route {
  routeId: string;
  taskId: string;
  resourceId: string;
  nodes: RouteNode[];
  plannedDistance: number;
  plannedDuration: number;
  replanReason: string | null;
}

export interface ExecutionEvent {
  eventId: string;
  taskId: string;
  resourceId: string | null;
  eventType: EventType;
  occurredAt: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ExecutionEventListResponse {
  events: ExecutionEvent[];
}

export interface Conflict {
  conflictId: string;
  conflictType: ConflictType;
  resourceIds: string[];
  locationCode: string;
  detectedAt: string;
  resolvedAt: string | null;
  strategy: YieldStrategy | null;
  status: ConflictStatus;
}

export interface ConflictListResponse {
  conflicts: Conflict[];
}

// ── 统计 ──

export interface ResourceUtilization {
  resourceId: string;
  resourceName: string;
  busyDuration: number;
  onlineDuration: number;
  utilizationRate: number;
}

export interface PriorityDistribution {
  priority: Priority;
  count: number;
  percentage: number;
}

export interface ResourceTaskDistribution {
  resourceId: string;
  resourceName: string;
  taskCount: number;
}

export interface StatisticsResponse {
  totalTasks: number;
  completedTasks: number;
  cancelledTasks: number;
  errorTasks: number;
  completionRate: number;
  averageDuration: number;
  anomalyRate: number;
  resourceUtilization: ResourceUtilization[];
  priorityDistribution: PriorityDistribution[];
  resourceTaskDistribution: ResourceTaskDistribution[];
}

// ── 请求体 ──

export interface CreateTaskRequest {
  sourceLocationCode: string;
  targetLocationCode: string;
  cargoName: string;
  cargoQuantity: number;
  priority: Priority;
  remark?: string;
  createdBy: string;
  autoAssign?: boolean;
}

export interface AssignTaskRequest {
  resourceId?: string;
  autoAssign?: boolean;
}

export interface CancelTaskRequest {
  cancelledBy: string;
  confirm?: boolean;
}

export interface CompleteTaskRequest {
  completedBy: string;
}

export interface RecoverTaskRequest {
  recoveredBy: string;
  action: RecoverAction;
}

export interface CreateResourceRequest {
  name: string;
  type: ResourceType;
  initialLocationCode: string;
}

export interface UpdateResourceStatusRequest {
  status: ResourceStatus;
}

export interface ReportPositionRequest {
  locationCode: string;
}

export interface PositionReportResponse {
  acknowledged: boolean;
  routeProgress: {
    currentNodeIndex: number;
    totalNodes: number;
    remainingDistance: number;
    estimatedRemainingDuration: number;
  } | null;
}

// ── WebSocket 消息 ──

export type WsMessageType =
  | 'task_status_change'
  | 'device_position_update'
  | 'device_status_change'
  | 'traffic_alert'
  | 'execution_event'
  | 'anomaly_alert';

export interface WsMessage<T extends WsMessageType = WsMessageType> {
  type: T;
  payload: WsPayloadMap[T];
}

export interface WsPayloadMap {
  task_status_change: {
    taskId: string;
    oldStatus: TaskStatus;
    newStatus: TaskStatus;
    timestamp: string;
  };
  device_position_update: {
    resourceId: string;
    locationCode: string;
    timestamp: string;
  };
  device_status_change: {
    resourceId: string;
    oldStatus: ResourceStatus;
    newStatus: ResourceStatus;
    timestamp: string;
  };
  traffic_alert: {
    conflictId: string;
    conflictType: ConflictType;
    resourceIds: string[];
    locationCode: string;
    timestamp: string;
  };
  execution_event: {
    eventId: string;
    taskId: string;
    eventType: EventType;
    description: string;
    timestamp: string;
  };
  anomaly_alert: {
    taskId: string;
    resourceId: string;
    anomalyType: string;
    description: string;
    timestamp: string;
  };
}

export interface WsSubscribeMessage {
  type: 'subscribe';
  payload: { types: string[] };
}

export interface WsPingMessage {
  type: 'ping';
}

// ── 错误 ──

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiError;
}
