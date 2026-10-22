import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../platform/api-client'
import type { BusinessGroupDTO, DataResponse } from '../types'

export function useBusinessGroups() {
  const [groups, setGroups] = useState<BusinessGroupDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest<DataResponse<BusinessGroupDTO[]>>('/api/business-groups')
      setGroups(result.data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载业务组失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { groups, loading, error, refresh: load }
}
