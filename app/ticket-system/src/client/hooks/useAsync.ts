import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  loading: boolean
  error: string | undefined
  reload: () => void
}

// 通用异步数据获取 hook：提供加载/错误状态与手动刷新。
// fn 通过 ref 持有最新引用，依赖 deps 变化时自动重新获取。
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(undefined)
    fnRef.current()
      .then((result) => { if (active) { setData(result); setLoading(false) } })
      .catch((cause) => { if (active) { setError(cause instanceof Error ? cause.message : '请求失败'); setLoading(false) } })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, loading, error, reload }
}
