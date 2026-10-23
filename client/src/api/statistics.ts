import { apiGet, buildQuery } from './client';
import type { StatisticsResponse, StatisticsPeriod, Priority } from './types';

export interface StatisticsQuery {
  startDate?: string;
  endDate?: string;
  period?: StatisticsPeriod;
  resourceId?: string;
  priority?: Priority;
}

export function fetchStatistics(query: StatisticsQuery = {}): Promise<StatisticsResponse> {
  return apiGet<StatisticsResponse>(
    `/statistics${buildQuery({
      startDate: query.startDate,
      endDate: query.endDate,
      period: query.period,
      resourceId: query.resourceId,
      priority: query.priority,
    })}`,
  );
}

export function exportStatisticsCsv(query: StatisticsQuery = {}): Promise<Blob> {
  const qs = buildQuery({
    startDate: query.startDate,
    endDate: query.endDate,
    period: query.period,
    resourceId: query.resourceId,
    priority: query.priority,
  });
  return fetch(`/api/statistics/export${qs}`).then((res) => {
    if (!res.ok) throw new Error('导出失败');
    return res.blob();
  });
}
