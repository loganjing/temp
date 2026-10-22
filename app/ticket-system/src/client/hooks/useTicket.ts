import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../platform/api-client'
import type { DataResponse, TicketDetailDTO } from '../types'

export function useTicket(id: string | null) {
  const [ticket, setTicket] = useState<TicketDetailDTO | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!id) { setTicket(null); return }
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest<DataResponse<TicketDetailDTO>>(`/api/tickets/${encodeURIComponent(id)}`)
      setTicket(result.data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载工单详情失败')
      setTicket(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  return { ticket, loading, error, refresh: load }
}
