import { apiGet } from './client';
import type { LocationListResponse, TopologyResponse } from './types';

export function fetchLocations(): Promise<LocationListResponse> {
  return apiGet<LocationListResponse>('/locations');
}

export function fetchTopology(): Promise<TopologyResponse> {
  return apiGet<TopologyResponse>('/maps/topology');
}
