import { apiGet, buildQuery } from './client';
import type { ConflictListResponse, ConflictStatus } from './types';

export function fetchConflicts(status: ConflictStatus = 'active'): Promise<ConflictListResponse> {
  return apiGet<ConflictListResponse>(`/traffic/conflicts${buildQuery({ status })}`);
}
