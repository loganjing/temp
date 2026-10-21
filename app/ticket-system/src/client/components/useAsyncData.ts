import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 面向只读加载场景的小型数据加载 hook：
 * loading / data / error / reload 状态由 hook 统一维护，loader 变化不在依赖中。
 */
export function useAsyncData<T>(loader: () => Promise<T>, deps: ReadonlyArray<unknown>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [nonce, setNonce] = useState(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    loaderRef
      .current()
      .then((result) => {
        if (!active) return
        setData(result)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(cause)
        setLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps 由调用方按查询条件传入
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, loading, error, reload }
}
