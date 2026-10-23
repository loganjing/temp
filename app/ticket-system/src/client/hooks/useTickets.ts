import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ticketApi,
  type WorkbenchTicket,
  type TicketDetail,
  type WorkbenchSort,
} from '../api/ticket-api'

export interface WorkbenchFilters {
  search: string
  status: string
  priority: string
  category: string
  companyId: string
  sort: WorkbenchSort
  page: number
  pageSize: number
}

export const defaultFilters: WorkbenchFilters = {
  search: '',
  status: '',
  priority: '',
  category: '',
  companyId: '',
  sort: 'created_desc',
  page: 1,
  pageSize: 20,
}

export function useWorkbenchTickets(filters: WorkbenchFilters) {
  const [items, setItems] = useState<WorkbenchTicket[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const current = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const result = await ticketApi.getWorkbenchTickets({
        search: filters.search || undefined,
        status: filters.status || undefined,
        priority: filters.priority || undefined,
        category: filters.category || undefined,
        companyId: filters.companyId || undefined,
        sort: filters.sort,
        page: filters.page,
        pageSize: filters.pageSize,
      })
      if (current === requestId.current) {
        setItems(result.items)
        setTotal(result.total)
      }
    } catch (cause) {
      if (current === requestId.current) {
        setError(cause instanceof Error ? cause.message : '加载工单列表失败')
      }
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }, [filters.search, filters.status, filters.priority, filters.category, filters.companyId, filters.sort, filters.page, filters.pageSize])

  useEffect(() => { void load() }, [load])

  return { items, total, loading, error, reload: load }
}

export function useTicketDetail(ticketId: string | null) {
  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!ticketId) {
      setDetail(null)
      return
    }
    setLoading(true)
    setError('')
    try {
      setDetail(await ticketApi.getTicket(ticketId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载工单详情失败')
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => { void load() }, [load])

  return { detail, loading, error, reload: load, setDetail }
}
