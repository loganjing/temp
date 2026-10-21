import { useCallback, useEffect, useRef, useState } from 'react'

export type AsyncState<T> = { phase: 'loading' } | { phase: 'error'; error: unknown } | { phase: 'ready'; data: T }
export type AsyncHandle<T> = AsyncState<T> & { reload: () => void }

/**
 * 声明式异步数据钩子：
 * - 依赖变化（筛选、选中工单变化）时进入 loading（列表骨架）；
 * - reload（操作后刷新）时保留已就绪数据，避免反馈被骨架打断；
 * - enabled 为 false 时不发起请求（用于按权限/模式裁剪的请求）。
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
  options?: { enabled?: boolean },
): AsyncHandle<T> {
  const enabled = options?.enabled ?? true
  const [state, setState] = useState<AsyncState<T>>({ phase: 'loading' })
  const [tick, setTick] = useState(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const depsKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const depsKey = JSON.stringify(deps)
    if (depsKeyRef.current === null || depsKeyRef.current !== depsKey) {
      depsKeyRef.current = depsKey
      setState({ phase: 'loading' })
    }
    fetcherRef.current().then(
      (data) => { if (alive) setState({ phase: 'ready', data }) },
      (error) => { if (alive) setState({ phase: 'error', error }) },
    )
    return () => { alive = false }
  }, [...deps, tick, enabled])

  const reload = useCallback(() => { setTick((current) => current + 1) }, [])

  if (state.phase === 'loading') return { phase: 'loading', reload }
  if (state.phase === 'error') return { phase: 'error', error: state.error, reload }
  return { phase: 'ready', data: state.data, reload }
}
