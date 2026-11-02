import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from './api-client'

type ApiState<T> = {
  data: T | undefined
  loading: boolean
  error: unknown
}

/**
 * 读取一个 GET 资源。path 为 null 时不发请求（例如当前角色不可读的子资源）。
 * 重新加载失败时保留上一次成功数据，便于"保留已加载内容并给出可重试提示"。
 */
export function useApiResource<T>(path: string | null) {
  const [state, setState] = useState<ApiState<T>>({ data: undefined, loading: path !== null, error: undefined })
  const [version, setVersion] = useState(0)
  const loadedPath = useRef<string | null>(null)

  useEffect(() => {
    if (path === null) {
      loadedPath.current = null
      setState({ data: undefined, loading: false, error: undefined })
      return
    }
    let active = true
    // 同一路径重新加载时保留旧数据；切换到另一资源时不复用上一资源的字段。
    setState((previous) => ({ data: loadedPath.current === path ? previous.data : undefined, loading: true, error: undefined }))
    apiRequest<T>(path)
      .then((data) => { if (active) { loadedPath.current = path; setState({ data, loading: false, error: undefined }) } })
      .catch((error: unknown) => { if (active) setState((previous) => ({ data: previous.data, loading: false, error })) })
    return () => { active = false }
  }, [path, version])

  const reload = useCallback(() => setVersion((value) => value + 1), [])
  return { ...state, reload }
}
