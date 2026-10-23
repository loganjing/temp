import { apiGet } from './client';
import type { ExecutionEventListResponse } from './types';

export function fetchExecutionEvents(taskId: string): Promise<ExecutionEventListResponse> {
  return apiGet<ExecutionEventListResponse>(`/tasks/${taskId}/events`);
}
