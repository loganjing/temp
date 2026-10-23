// 共享类型定义 — 前后端共用的 TypeScript 类型

// ─── 枚举 ───

export type MaturityLevel = '未成熟' | '接近成熟' | '成熟' | '过熟';
export type TaskStatus = '待执行' | '执行中' | '已完成' | '已取消';
export type TaskPriority = '普通' | '紧急';
export type ExceptionType = '天气' | '病虫害' | '设备故障' | '人员' | '其他';
export type ExceptionStatus = '待处理' | '处理中' | '已解决';

// ─── 地块 ───

export interface Plot {
  id: string;
  code: string;
  name: string;
  variety: string;
  area: number;
  currentMaturityLevel: MaturityLevel | null;
  harvestable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlotListResponse {
  items: Plot[];
}

export interface CreatePlotRequest {
  code: string;
  name: string;
  variety: string;
  area: number;
}

// ─── 成熟度评估 ───

export interface Assessment {
  id: string;
  plotId: string;
  plotCode: string;
  plotName: string;
  variety: string;
  maturityLevel: MaturityLevel;
  assessmentTime: string;
  assessor: string;
  notes: string | null;
  createdAt: string;
}

export interface AssessmentListResponse {
  items: Assessment[];
}

export interface CreateAssessmentRequest {
  plotId: string;
  maturityLevel: MaturityLevel;
  assessmentTime: string;
  assessor: string;
  notes?: string;
}

// ─── 采摘任务 ───

export interface PickingTask {
  id: string;
  taskNo: string;
  plotId: string;
  plotCode: string;
  plotName: string;
  variety: string;
  plannedQuantity: number;
  assignedWorker: string;
  plannedDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  notes: string | null;
  totalPickedQuantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskListResponse {
  items: PickingTask[];
}

export interface CreateTaskRequest {
  plotId: string;
  plannedQuantity: number;
  assignedWorker: string;
  plannedDate: string;
  priority: TaskPriority;
  notes?: string;
}

export interface UpdateTaskStatusRequest {
  status: TaskStatus;
}

export interface UpdateTaskStatusResponse {
  id: string;
  taskNo: string;
  status: TaskStatus;
  updatedAt: string;
}

// ─── 作业进度 ───

export interface ProgressReport {
  id: string;
  taskId: string;
  pickedQuantity: number;
  reportTime: string;
  notes: string | null;
  createdAt: string;
}

export interface ProgressReportListResponse {
  items: ProgressReport[];
  totalPickedQuantity: number;
}

export interface CreateProgressRequest {
  pickedQuantity: number;
  reportTime: string;
  notes?: string;
}

export interface CreateProgressResponse {
  id: string;
  taskId: string;
  pickedQuantity: number;
  reportTime: string;
  notes: string | null;
  totalPickedQuantity: number;
  createdAt: string;
}

// ─── 进度监控概览 ───

export interface MonitoringOverviewResponse {
  taskSummary: {
    assigned: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  };
  inProgressTasks: InProgressTask[];
  pendingExceptionCount: number;
}

export interface InProgressTask {
  id: string;
  taskNo: string;
  plotCode: string;
  plotName: string;
  assignedWorker: string;
  plannedQuantity: number;
  totalPickedQuantity: number;
  priority: TaskPriority;
  status: TaskStatus;
  hasPendingException: boolean;
}

// ─── 异常报告 ───

export interface ExceptionReport {
  id: string;
  taskId: string | null;
  taskNo: string | null;
  exceptionType: ExceptionType;
  description: string;
  reporter: string;
  reportTime: string;
  status: ExceptionStatus;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExceptionListResponse {
  items: ExceptionReport[];
}

export interface CreateExceptionRequest {
  taskId?: string;
  exceptionType: ExceptionType;
  description: string;
  reporter: string;
  reportTime: string;
}

export interface UpdateExceptionRequest {
  status: ExceptionStatus;
  resolutionNotes?: string;
}

export interface UpdateExceptionResponse {
  id: string;
  status: ExceptionStatus;
  resolutionNotes: string | null;
  updatedAt: string;
}

// ─── 产量统计 ───

export interface StatisticsResponse {
  summary: {
    totalPickedQuantity: number;
    completedTaskCount: number;
    workerCount: number;
  };
  byPlot: PlotStatistics[];
}

export interface PlotStatistics {
  plotId: string;
  plotCode: string;
  plotName: string;
  variety: string;
  totalPickedQuantity: number;
  completedTaskCount: number;
}

// ─── 通用错误 ───

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
