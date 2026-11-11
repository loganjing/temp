import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  loading: boolean
  error: Error | undefined
  reload: () => void
  setData: Dispatch<SetStateAction<T | undefined>>
}

// 最小数据获取 hook：加载中、空数据、错误与重试三态。
// 不在此处理鉴权或权限，前端只读展示。
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | undefined>(undefined)
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const depsKey = JSON.stringify(deps)
  const reloadTokenRef = useRef(0)

  const run = useCallback(() => {
    const token = ++reloadTokenRef.current
    setLoading(true)
    setError(undefined)
    loaderRef.current()
      .then((result) => {
        if (token === reloadTokenRef.current) {
          setData(result)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (token === reloadTokenRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setLoading(false)
        }
      })
  }, [depsKey])

  useEffect(() => {
    run()
  }, [run])

  return { data, loading, error, reload: run, setData }
}
