import { apiGet, apiPost, apiPatch, buildQuery } from './client';
import type {
  Resource,
  ResourceListResponse,
  CreateResourceRequest,
  UpdateResourceStatusRequest,
  ReportPositionRequest,
  PositionReportResponse,
  ResourceStatus,
} from './types';

export function fetchResources(status?: ResourceStatus): Promise<ResourceListResponse> {
  return apiGet<ResourceListResponse>(`/resources${buildQuery({ status })}`);
}

export function fetchResourceDetail(resourceId: string): Promise<Resource> {
  return apiGet<Resource>(`/resources/${resourceId}`);
}

export function createResource(body: CreateResourceRequest): Promise<Resource> {
  return apiPost<Resource>('/resources', body);
}

export function updateResourceStatus(
  resourceId: string,
  body: UpdateResourceStatusRequest,
): Promise<Resource> {
  return apiPatch<Resource>(`/resources/${resourceId}/status`, body);
}

export function reportPosition(
  resourceId: string,
  body: ReportPositionRequest,
): Promise<PositionReportResponse> {
  return apiPost<PositionReportResponse>(`/resources/${resourceId}/position`, body);
}
