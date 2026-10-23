import type {
  PickingTask,
  TaskListResponse,
  CreateTaskRequest,
  UpdateTaskStatusRequest,
  UpdateTaskStatusResponse,
  TaskStatus,
} from '../types';
import { apiClient } from './client';
import { USE_MOCK } from '../../lib/config';
import { mockTasks, mockPlots } from '../../lib/mock-data';

export interface TaskQueryParams {
  status?: TaskStatus;
  plotId?: string;
  assignedWorker?: string;
  plannedDate?: string;
}

export async function fetchTasks(params?: TaskQueryParams): Promise<TaskListResponse> {
  if (USE_MOCK) {
    let items = [...mockTasks];
    if (params?.status) {
      items = items.filter((t) => t.status === params.status);
    }
    if (params?.plotId) {
      items = items.filter((t) => t.plotId === params.plotId);
    }
    if (params?.assignedWorker) {
      items = items.filter((t) => t.assignedWorker.includes(params.assignedWorker!));
    }
    if (params?.plannedDate) {
      items = items.filter((t) => t.plannedDate === params.plannedDate);
    }
    return { items };
  }
  return apiClient.get<TaskListResponse>('/tasks', {
    status: params?.status,
    plotId: params?.plotId,
    assignedWorker: params?.assignedWorker,
    plannedDate: params?.plannedDate,
  });
}

export async function createTask(req: CreateTaskRequest): Promise<PickingTask> {
  if (USE_MOCK) {
    const plot = mockPlots.find((p) => p.id === req.plotId);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(mockTasks.length + 1).padStart(3, '0');
    const task: PickingTask = {
      id: `task-${Date.now()}`,
      taskNo: `PT-${dateStr}-${seq}`,
      plotId: req.plotId,
      plotCode: plot?.code || '',
      plotName: plot?.name || '',
      variety: plot?.variety || '',
      plannedQuantity: req.plannedQuantity,
      assignedWorker: req.assignedWorker,
      plannedDate: req.plannedDate,
      priority: req.priority,
      status: '待执行',
      notes: req.notes ?? null,
      totalPickedQuantity: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockTasks.unshift(task);
    return task;
  }
  return apiClient.post<PickingTask>('/tasks', req);
}

export async function updateTaskStatus(
  id: string,
  req: UpdateTaskStatusRequest,
): Promise<UpdateTaskStatusResponse> {
  if (USE_MOCK) {
    const task = mockTasks.find((t) => t.id === id);
    if (!task) {
      throw { code: 'TASK_NOT_FOUND', message: '任务不存在', status: 404 };
    }
    task.status = req.status;
    task.updatedAt = new Date().toISOString();
    return {
      id: task.id,
      taskNo: task.taskNo,
      status: task.status,
      updatedAt: task.updatedAt,
    };
  }
  return apiClient.patch<UpdateTaskStatusResponse>(`/tasks/${id}`, req);
}
