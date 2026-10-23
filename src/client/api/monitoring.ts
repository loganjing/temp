import type { MonitoringOverview } from '../types';
import { apiClient } from './client';
import { USE_MOCK } from '../../lib/config';
import { mockMonitoringOverview } from '../../lib/mock-data';

export async function fetchMonitoringOverview(): Promise<MonitoringOverview> {
  if (USE_MOCK) {
    return JSON.parse(JSON.stringify(mockMonitoringOverview));
  }
  return apiClient.get<MonitoringOverview>('/monitoring/overview');
}
