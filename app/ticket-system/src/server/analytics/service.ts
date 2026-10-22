import {
  TICKET_STATUSES,
  type DistributionBoundary,
  type DistributionResponse,
  type OverviewResponse,
  type SatisfactionSummary,
  type TicketStatus,
} from '../../shared/contracts'
import type { TicketFilter, TicketRepository } from '../tickets/repository'

export type DistributionQuery = { by: DistributionBoundary; from?: string; to?: string }
export type OverviewQuery = { from?: string; to?: string; groupId?: string; category?: string }

const round = (value: number, digits: number): number => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * analytics：请求时按公司范围实时聚合，只经工单域公开只读查询取数，不直接读取工单相关表。
 * 平均响应时间＝“创建时间→首次回复时间”间隔的算术平均（仅计有回复的工单，全部无回复时为 null）；
 * 满意度＝已提交评价的聚合；热点问题＝按分类工单数量降序取前 10（并列按分类名升序）。
 */
export function createAnalyticsService(deps: { tickets: TicketRepository }) {
  const { tickets } = deps

  const filterOf = (query: { from?: string; to?: string; groupId?: string; category?: string }): TicketFilter => ({
    from: query.from,
    to: query.to,
    groupId: query.groupId,
    category: query.category,
  })

  return {
    async distribution(companyId: string, companyName: string, query: DistributionQuery): Promise<DistributionResponse> {
      const filter = filterOf(query)
      if (query.by === 'company') {
        // 本公司一条：count 等于范围内公司实际工单数。
        const count = await tickets.countTickets(companyId, filter)
        return { by: 'company', total: count, items: [{ key: companyId, name: companyName, count }] }
      }
      const items = await tickets.countByDepartment(companyId, filter)
      const total = items.reduce((sum, item) => sum + item.count, 0)
      return { by: 'department', total, items }
    },

    async overview(companyId: string, query: OverviewQuery): Promise<OverviewResponse> {
      const filter = filterOf(query)
      const [statusRows, responseTimes, ratings, categories] = await Promise.all([
        tickets.countByStatus(companyId, filter),
        tickets.listFirstResponseTimes(companyId, filter),
        tickets.listRatings(companyId, filter),
        tickets.countByCategory(companyId, filter),
      ])

      const statusBreakdown = Object.fromEntries(TICKET_STATUSES.map((status) => [status, 0])) as Record<TicketStatus, number>
      for (const row of statusRows) statusBreakdown[row.status] = row.count
      const ticketCount = TICKET_STATUSES.reduce((sum, status) => sum + statusBreakdown[status], 0)

      const durations = responseTimes
        .filter((entry) => entry.firstReplyAt !== null)
        .map((entry) => (Date.parse(entry.firstReplyAt as string) - Date.parse(entry.createdAt)) / 1000)
      const avgFirstResponseSeconds = durations.length
        ? round(durations.reduce((sum, value) => sum + value, 0) / durations.length, 1)
        : null

      const distribution: SatisfactionSummary['distribution'] = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
      for (const score of ratings) {
        const key = String(score) as keyof SatisfactionSummary['distribution']
        if (key in distribution) distribution[key] += 1
      }
      const satisfaction: SatisfactionSummary = {
        average: ratings.length ? round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length, 2) : null,
        count: ratings.length,
        distribution,
      }

      return { ticketCount, statusBreakdown, avgFirstResponseSeconds, satisfaction, hotCategories: categories.slice(0, 10) }
    },
  }
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>
