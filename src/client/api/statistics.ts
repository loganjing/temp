import type { StatisticsResponse } from '../types';
import { apiClient } from './client';
import { USE_MOCK } from '../../lib/config';
import { mockStatistics } from '../../lib/mock-data';

export interface StatisticsQueryParams {
  plotId?: string;
  variety?: string;
  startDate?: string;
  endDate?: string;
}

export async function fetchStatistics(params?: StatisticsQueryParams): Promise<StatisticsResponse> {
  if (USE_MOCK) {
    let data = JSON.parse(JSON.stringify(mockStatistics)) as StatisticsResponse;
    if (params?.plotId) {
      data.byPlot = data.byPlot.filter((p) => p.plotId === params.plotId);
      data.summary.totalPickedQuantity = data.byPlot.reduce((sum, p) => sum + p.totalPickedQuantity, 0);
      data.summary.completedTaskCount = data.byPlot.reduce((sum, p) => sum + p.completedTaskCount, 0);
    }
    if (params?.variety) {
      data.byPlot = data.byPlot.filter((p) => p.variety === params.variety);
      data.summary.totalPickedQuantity = data.byPlot.reduce((sum, p) => sum + p.totalPickedQuantity, 0);
      data.summary.completedTaskCount = data.byPlot.reduce((sum, p) => sum + p.completedTaskCount, 0);
    }
    return data;
  }
  return apiClient.get<StatisticsResponse>('/statistics', {
    plotId: params?.plotId,
    variety: params?.variety,
    startDate: params?.startDate,
    endDate: params?.endDate,
  });
}
