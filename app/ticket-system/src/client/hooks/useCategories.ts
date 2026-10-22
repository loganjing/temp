import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../platform/api-client'
import type { CategoryDTO, DataResponse } from '../types'

export function useCategories() {
  const [categories, setCategories] = useState<CategoryDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest<DataResponse<CategoryDTO[]>>('/api/categories')
      setCategories(result.data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载分类失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { categories, loading, error, refresh: load }
}
