import { useCallback, useEffect, useRef, useState } from 'react'
import { listTickets, type TicketListQuery } from './api'
import type { Ticket } from './types'
import { apiErrorMessage } from './components/ui'

/** 工单列表查询：组合条件变化或调用 reload() 时重新请求，并保留最新一次结果。 */
export function useTicketList(query: TicketListQuery) {
  const [items, setItems] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const requestId = useRef(0)
  const queryKey = JSON.stringify(query)

  useEffect(() => {
    const id = ++requestId.current
    setLoading(true)
    setError('')
    listTickets(query)
      .then((result) => {
        if (id !== requestId.current) return
        setItems(result.items)
        setTotal(result.total)
      })
      .catch((cause: unknown) => {
        if (id !== requestId.current) return
        setItems([])
        setTotal(0)
        setError(apiErrorMessage(cause))
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })
    // query 以序列化键参与依赖，避免对象引用变化导致重复请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, reloadKey])

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])
  return { items, total, loading, error, reload }
}

/** 搜索输入防抖：避免每次按键都触发列表请求。 */
export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}
