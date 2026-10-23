import type {
  Assessment,
  AssessmentListResponse,
  CreateAssessmentRequest,
  MaturityLevel,
} from '../types';
import { apiClient } from './client';
import { USE_MOCK } from '../../lib/config';
import { mockAssessments, mockPlots } from '../../lib/mock-data';

export interface AssessmentQueryParams {
  plotId?: string;
  plotCode?: string;
  maturityLevel?: MaturityLevel;
  harvestable?: boolean;
}

export async function fetchAssessments(params?: AssessmentQueryParams): Promise<AssessmentListResponse> {
  if (USE_MOCK) {
    let items = [...mockAssessments];
    if (params?.plotId) {
      items = items.filter((a) => a.plotId === params.plotId);
    }
    if (params?.plotCode) {
      items = items.filter((a) => a.plotCode.includes(params.plotCode!));
    }
    if (params?.maturityLevel) {
      items = items.filter((a) => a.maturityLevel === params.maturityLevel);
    }
    if (params?.harvestable !== undefined) {
      const harvestablePlotIds = mockPlots
        .filter((p) => p.harvestable === params!.harvestable)
        .map((p) => p.id);
      items = items.filter((a) => harvestablePlotIds.includes(a.plotId));
    }
    return { items };
  }
  return apiClient.get<AssessmentListResponse>('/assessments', {
    plotId: params?.plotId,
    plotCode: params?.plotCode,
    maturityLevel: params?.maturityLevel,
    harvestable: params?.harvestable !== undefined ? String(params.harvestable) : undefined,
  });
}

export async function createAssessment(req: CreateAssessmentRequest): Promise<Assessment> {
  if (USE_MOCK) {
    const plot = mockPlots.find((p) => p.id === req.plotId);
    const assessment: Assessment = {
      id: `asmt-${Date.now()}`,
      plotId: req.plotId,
      plotCode: plot?.code || '',
      plotName: plot?.name || '',
      variety: plot?.variety || '',
      maturityLevel: req.maturityLevel,
      assessmentTime: req.assessmentTime,
      assessor: req.assessor,
      notes: req.notes ?? null,
      createdAt: new Date().toISOString(),
    };
    mockAssessments.unshift(assessment);

    // 模拟后端更新地块可采摘状态
    if (plot) {
      plot.currentMaturityLevel = req.maturityLevel;
      const harvestableLevels: MaturityLevel[] = ['接近成熟', '成熟', '过熟'];
      plot.harvestable = harvestableLevels.includes(req.maturityLevel);
      plot.updatedAt = new Date().toISOString();
    }

    return assessment;
  }
  return apiClient.post<Assessment>('/assessments', req);
}
