import { apiGet, apiPost, buildQuery } from './client';
import type {
  Task,
  TaskDetail,
  TaskListResponse,
  CreateTaskRequest,
  AssignTaskRequest,
  CancelTaskRequest,
  CompleteTaskRequest,
  RecoverTaskRequest,
  TaskStatus,
  Priority,
} from './types';

export interface TaskListQuery {
  status?: TaskStatus;
  priority?: Priority;
  resourceId?: string;
  page?: number;
  pageSize?: number;
}

export function fetchTasks(query: TaskListQuery = {}): Promise<TaskListResponse> {
  return apiGet<TaskListResponse>(
    `/tasks${buildQuery({
      status: query.status,
      priority: query.priority,
      resourceId: query.resourceId,
      page: query.page,
      pageSize: query.pageSize,
    })}`,
  );
}

export function fetchTaskDetail(taskId: string): Promise<TaskDetail> {
  return apiGet<TaskDetail>(`/tasks/${taskId}`);
}

export function createTask(body: CreateTaskRequest): Promise<Task> {
  return apiPost<Task>('/tasks', body);
}

export function assignTask(taskId: string, body: AssignTaskRequest): Promise<Task> {
  return apiPost<Task>(`/tasks/${taskId}/assign`, body);
}

export function cancelTask(taskId: string, body: CancelTaskRequest): Promise<Task> {
  return apiPost<Task>(`/tasks/${taskId}/cancel`, body);
}

export function completeTask(taskId: string, body: CompleteTaskRequest): Promise<Task> {
  return apiPost<Task>(`/tasks/${taskId}/complete`, body);
}

export function recoverTask(taskId: string, body: RecoverTaskRequest): Promise<Task> {
  return apiPost<Task>(`/tasks/${taskId}/recover`, body);
}
