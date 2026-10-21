import { useCallback, useEffect, useState } from 'react'

export interface AsyncResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

/** 轻量异步加载 hook：deps 变化或 reload() 时重新请求，卸载后忽略迟到响应。 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fn().then(
      (value) => {
        if (cancelled) return
        setData(value)
        setLoading(false)
      },
      (cause) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : '请求失败')
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((value) => value + 1), [])
  return { data, loading, error, reload }
}

/** 将 unknown 错误转为可展示文案。 */
export function errorMessage(cause: unknown, fallback = '操作失败'): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}
