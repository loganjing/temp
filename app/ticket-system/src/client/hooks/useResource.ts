import { useCallback, useEffect, useState } from 'react'

interface ResourceState<T> {
  loading: boolean
  error: string | null
  data: T | null
}

export interface ResourceResult<T> extends ResourceState<T> {
  reload: () => void
}

// 轻量数据加载 hook：loader 引用变化（useCallback 依赖变化）或调用 reload() 时重新加载。
export function useResource<T>(loader: () => Promise<T>, fallback: string, errorMessage?: (cause: unknown) => string): ResourceResult<T> {
  const [state, setState] = useState<ResourceState<T>>({ loading: true, error: null, data: null })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState((previous) => ({ ...previous, loading: true, error: null }))
    loader()
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data })
      })
      .catch((cause) => {
        if (cancelled) return
        const message = errorMessage
          ? errorMessage(cause)
          : cause instanceof Error && cause.message
            ? cause.message
            : fallback
        setState({ loading: false, error: message, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [loader, fallback, errorMessage, version])

  const reload = useCallback(() => {
    setVersion((current) => current + 1)
  }, [])

  return { ...state, reload }
}
