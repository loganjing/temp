import { apiGet } from './client';
import type { Route } from './types';

export function fetchRoute(taskId: string): Promise<Route> {
  return apiGet<Route>(`/routes/${taskId}`);
}
