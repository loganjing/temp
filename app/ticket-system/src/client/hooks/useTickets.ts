import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../platform/api-client'
import type { PaginatedResponse, TicketDTO } from '../types'

export interface TicketQuery {
  status?: string
  priority?: string
  categoryId?: string
  search?: string
  sort?: string
  order?: string
  page?: number
  pageSize?: number
}

export function useTickets(query: TicketQuery) {
  const [tickets, setTickets] = useState<TicketDTO[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (query.status) params.set('status', query.status)
      if (query.priority) params.set('priority', query.priority)
      if (query.categoryId) params.set('categoryId', query.categoryId)
      if (query.search) params.set('search', query.search)
      if (query.sort) params.set('sort', query.sort)
      if (query.order) params.set('order', query.order)
      if (query.page) params.set('page', String(query.page))
      if (query.pageSize) params.set('pageSize', String(query.pageSize))
      const result = await apiRequest<PaginatedResponse<TicketDTO>>(`/api/tickets?${params}`)
      setTickets(result.data)
      setTotal(result.total)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载工单失败')
    } finally {
      setLoading(false)
    }
  }, [query.status, query.priority, query.categoryId, query.search, query.sort, query.order, query.page, query.pageSize])

  useEffect(() => { void load() }, [load])

  return { tickets, total, loading, error, refresh: load }
}
