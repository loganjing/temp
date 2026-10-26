/**
 * 数据获取 Hook
 * 提供加载/空/错误/重试的统一状态管理。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiError } from '../types';

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
}

export interface UseFetchResult<T> extends FetchState<T> {
  refetch: () => void;
}

/**
 * 通用数据获取 hook。
 * @param fetcher 返回 Promise<T> 的函数（稳定引用）
 * @param deps 依赖数组，变化时自动重新获取
 */
export function useFetch<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): UseFetchResult<T> {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const mountedRef = useRef(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetcherRef
      .current()
      .then((data) => {
        if (!cancelled && mountedRef.current) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch((err: ApiError) => {
        if (!cancelled && mountedRef.current) {
          setState((prev) => ({
            data: prev.data,
            loading: false,
            error: err ?? { error: '未知错误', code: 'UNKNOWN' },
          }));
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refreshKey]);

  return { ...state, refetch };
}
