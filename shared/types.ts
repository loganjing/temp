// ============================================================================
// Shared TypeScript Types — Warehouse Transport System (wi-t1000025)
// ============================================================================

// --- Enumerations ----------------------------------------------------------

export type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'in_transit'
  | 'completed'
  | 'cancelled'
  | 'error';

export type DeviceStatus = 'idle' | 'busy' | 'offline' | 'fault';

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

export type DeviceType = 'agv' | 'forklift';

export type LocationType = 'storage' | 'transit';

export type EdgeDirection = 'bidirectional' | 'unidirectional';

// --- Entity Types (API response shapes — INTEGER PKs serialized as string) --

export interface Task {
  taskId: string;
  sourceLocationCode: string;
  targetLocationCode: string;
  cargoName: string;
  cargoQuantity: number;
  priority: Priority;
  status: TaskStatus;
  createdBy: string;
  createdAt: string;
  remark?: string | null;
  assignedResourceId?: string | null;
  assignedAt?: string | null;
  assignmentMethod?: AssignmentMethod | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
}

export interface TaskDetail extends Task {
  currentRoute?: Route | null;
  recentEvents: ExecutionEvent[];
}

export interface Resource {
  resourceId: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  currentLocationCode?: string | null;
  lastPositionAt?: string | null;
}

export interface ResourceDetail extends Resource {
  currentTaskId?: string | null;
}

export interface Location {
  locationCode: string;
  name: string;
  x: number;
  y: number;
  type: LocationType;
}

export interface MapEdge {
  fromLocationCode: string;
  toLocationCode: string;
  distance: number;
  direction: EdgeDirection;
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
  replanReason?: string | null;
}

export interface ExecutionEvent {
  eventId: string;
  taskId: string;
  resourceId?: string | null;
  eventType: EventType;
  occurredAt: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface TrafficConflict {
  conflictId: string;
  conflictType: ConflictType;
  resourceIds: string[];
  locationCode: string;
  detectedAt: string;
  resolvedAt?: string | null;
  strategy?: YieldStrategy | null;
  status: ConflictStatus;
}

// --- Pagination ------------------------------------------------------------

export interface PaginatedResult<T> {
  total: number;
  page: number;
  pageSize: number;
  tasks: T[];
}

// --- API Request Bodies ----------------------------------------------------

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
  action: 'resume' | 'cancel';
}

export interface CreateResourceRequest {
  name: string;
  type: DeviceType;
  initialLocationCode: string;
}

export interface UpdateResourceStatusRequest {
  status: DeviceStatus;
}

export interface ReportPositionRequest {
  locationCode: string;
}

// --- API Response Wrappers -------------------------------------------------

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export interface TaskListResponse {
  tasks: Task[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ResourceListResponse {
  resources: Resource[];
}

export interface LocationListResponse {
  locations: Location[];
}

export interface TopologyResponse {
  nodes: Location[];
  edges: MapEdge[];
}

export interface RouteResponse {
  routeId: string;
  taskId: string;
  resourceId: string;
  nodes: RouteNode[];
  plannedDistance: number;
  plannedDuration: number;
  replanReason?: string | null;
}

export interface ConflictListResponse {
  conflicts: TrafficConflict[];
}

export interface EventListResponse {
  events: ExecutionEvent[];
}

export interface PositionReportResponse {
  acknowledged: boolean;
  routeProgress?: {
    currentIndex: number;
    totalNodes: number;
    remainingDistance: number;
    estimatedRemainingTime: number;
  } | null;
}

// --- Statistics ------------------------------------------------------------

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

// --- WebSocket Message Types -----------------------------------------------

export type WSMessageType =
  | 'task_status_change'
  | 'device_position_update'
  | 'device_status_change'
  | 'traffic_alert'
  | 'execution_event'
  | 'anomaly_alert';

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  payload: T;
}

export interface TaskStatusChangePayload {
  taskId: string;
  oldStatus: TaskStatus;
  newStatus: TaskStatus;
  timestamp: string;
}

export interface DevicePositionUpdatePayload {
  resourceId: string;
  locationCode: string;
  timestamp: string;
}

export interface DeviceStatusChangePayload {
  resourceId: string;
  oldStatus: DeviceStatus;
  newStatus: DeviceStatus;
  timestamp: string;
}

export interface TrafficAlertPayload {
  conflictId: string;
  conflictType: ConflictType;
  resourceIds: string[];
  locationCode: string;
  timestamp: string;
}

export interface ExecutionEventPayload {
  eventId: string;
  taskId: string;
  eventType: EventType;
  description: string | null;
  timestamp: string;
}

export interface AnomalyAlertPayload {
  taskId: string | null;
  resourceId: string | null;
  anomalyType: string;
  description: string;
  timestamp: string;
}

// --- WebSocket Client Messages ---------------------------------------------

export interface WSSubscribeMessage {
  type: 'subscribe';
  payload: { types: WSMessageType[] };
}

export interface WSPingMessage {
  type: 'ping';
}

export type WSClientMessage = WSSubscribeMessage | WSPingMessage;
