import type {
  ExceptionReport,
  ExceptionListResponse,
  CreateExceptionRequest,
  UpdateExceptionRequest,
  UpdateExceptionResponse,
  ExceptionStatus,
  ExceptionType,
} from '../types';
import { apiClient } from './client';
import { USE_MOCK } from '../../lib/config';
import { mockExceptions, mockTasks } from '../../lib/mock-data';

export interface ExceptionQueryParams {
  status?: ExceptionStatus;
  exceptionType?: ExceptionType;
  taskId?: string;
}

export async function fetchExceptions(params?: ExceptionQueryParams): Promise<ExceptionListResponse> {
  if (USE_MOCK) {
    let items = [...mockExceptions];
    if (params?.status) {
      items = items.filter((e) => e.status === params.status);
    }
    if (params?.exceptionType) {
      items = items.filter((e) => e.exceptionType === params.exceptionType);
    }
    if (params?.taskId) {
      items = items.filter((e) => e.taskId === params.taskId);
    }
    return { items };
  }
  return apiClient.get<ExceptionListResponse>('/exceptions', {
    status: params?.status,
    exceptionType: params?.exceptionType,
    taskId: params?.taskId,
  });
}

export async function createException(req: CreateExceptionRequest): Promise<ExceptionReport> {
  if (USE_MOCK) {
    const task = req.taskId ? mockTasks.find((t) => t.id === req.taskId) : undefined;
    const report: ExceptionReport = {
      id: `exc-${Date.now()}`,
      taskId: req.taskId ?? null,
      taskNo: task?.taskNo ?? null,
      exceptionType: req.exceptionType,
      description: req.description,
      reporter: req.reporter,
      reportTime: req.reportTime,
      status: '待处理',
      resolutionNotes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockExceptions.unshift(report);
    return report;
  }
  return apiClient.post<ExceptionReport>('/exceptions', req);
}

export async function updateException(
  id: string,
  req: UpdateExceptionRequest,
): Promise<UpdateExceptionResponse> {
  if (USE_MOCK) {
    const report = mockExceptions.find((e) => e.id === id);
    if (!report) {
      throw { code: 'EXCEPTION_NOT_FOUND', message: '异常报告不存在', status: 404 };
    }
    report.status = req.status;
    if (req.resolutionNotes !== undefined) {
      report.resolutionNotes = req.resolutionNotes;
    }
    report.updatedAt = new Date().toISOString();
    return {
      id: report.id,
      status: report.status,
      resolutionNotes: report.resolutionNotes,
      updatedAt: report.updatedAt,
    };
  }
  return apiClient.patch<UpdateExceptionResponse>(`/exceptions/${id}`, req);
}
