import type {
  ProgressListResponse,
  CreateProgressRequest,
  CreateProgressResponse,
} from '../types';
import { apiClient } from './client';
import { USE_MOCK } from '../../lib/config';
import { mockProgressHistory, mockTasks } from '../../lib/mock-data';

export async function fetchTaskProgress(taskId: string): Promise<ProgressListResponse> {
  if (USE_MOCK) {
    void taskId; // mock 数据使用固定示例
    return {
      items: [...mockProgressHistory.items],
      totalPickedQuantity: mockProgressHistory.totalPickedQuantity,
    };
  }
  return apiClient.get<ProgressListResponse>(`/tasks/${taskId}/progress`);
}

export async function createProgress(
  taskId: string,
  req: CreateProgressRequest,
): Promise<CreateProgressResponse> {
  if (USE_MOCK) {
    const newQty = req.pickedQuantity;
    const task = mockTasks.find((t) => t.id === taskId);
    if (task) {
      task.totalPickedQuantity += newQty;
    }
    const prevTotal = mockProgressHistory.totalPickedQuantity;
    const report = {
      id: `prog-${Date.now()}`,
      taskId,
      pickedQuantity: newQty,
      reportTime: req.reportTime,
      notes: req.notes ?? null,
      createdAt: new Date().toISOString(),
    };
    mockProgressHistory.items.push(report);
    mockProgressHistory.totalPickedQuantity = prevTotal + newQty;

    return {
      id: report.id,
      taskId,
      pickedQuantity: newQty,
      reportTime: req.reportTime,
      notes: req.notes ?? null,
      totalPickedQuantity: prevTotal + newQty,
      createdAt: report.createdAt,
    };
  }
  return apiClient.post<CreateProgressResponse>(`/tasks/${taskId}/progress`, req);
}
