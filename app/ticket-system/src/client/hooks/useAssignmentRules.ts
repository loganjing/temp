import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../platform/api-client'
import type { AssignmentRuleDTO, DataResponse } from '../types'

export function useAssignmentRules() {
  const [rules, setRules] = useState<AssignmentRuleDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest<DataResponse<AssignmentRuleDTO[]>>('/api/assignment-rules')
      setRules(result.data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载分配规则失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { rules, loading, error, refresh: load }
}
