import type {
  Plot,
  PlotListResponse,
  CreatePlotRequest,
} from '../types';
import { apiClient } from './client';
import { USE_MOCK } from '../../lib/config';
import { mockPlots } from '../../lib/mock-data';

export interface PlotQueryParams {
  code?: string;
  variety?: string;
  harvestable?: boolean;
}

export async function fetchPlots(params?: PlotQueryParams): Promise<PlotListResponse> {
  if (USE_MOCK) {
    let items = [...mockPlots];
    if (params?.code) {
      items = items.filter((p) => p.code.includes(params.code!));
    }
    if (params?.variety) {
      items = items.filter((p) => p.variety === params.variety);
    }
    if (params?.harvestable !== undefined) {
      items = items.filter((p) => p.harvestable === params!.harvestable);
    }
    return { items };
  }
  return apiClient.get<PlotListResponse>('/plots', {
    code: params?.code,
    variety: params?.variety,
    harvestable: params?.harvestable !== undefined ? String(params.harvestable) : undefined,
  });
}

export async function createPlot(req: CreatePlotRequest): Promise<Plot> {
  if (USE_MOCK) {
    const plot: Plot = {
      id: `plot-${Date.now()}`,
      code: req.code,
      name: req.name,
      variety: req.variety,
      area: req.area,
      currentMaturityLevel: null,
      harvestable: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockPlots.push(plot);
    return plot;
  }
  return apiClient.post<Plot>('/plots', req);
}
