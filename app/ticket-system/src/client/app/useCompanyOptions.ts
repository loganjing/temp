import type { AuthUser, DistributionStats } from '../contract'
import { fetchDistribution } from '../api'
import { useAsyncData, type AsyncHandle } from './useAsyncData'

/**
 * 跨公司视角用户的公司选项（来自分布统计的公司维度，契约 7.1）。
 * 普通用户返回 null 且不发起请求（契约 §9：公司筛选控件仅 crossCompanyView 用户可见）。
 */
export function useCompanyOptions(me: AuthUser): AsyncHandle<DistributionStats> | null {
  const state = useAsyncData(() => fetchDistribution('company'), [], { enabled: me.crossCompanyView })
  return me.crossCompanyView ? state : null
}
