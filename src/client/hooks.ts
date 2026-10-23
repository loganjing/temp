/**
 * Generic async data hook for loading state, error, and retry.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * useAsync — calls `fn` on mount and whenever `deps` change.
 * Returns `{ data, loading, error, retry }`.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
): AsyncState<T> & { retry: () => void } {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const versionRef = useRef(0);

  const run = useCallback(() => {
    const v = ++versionRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef
      .current()
      .then((data) => {
        if (v === versionRef.current) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch((error) => {
        if (v === versionRef.current) {
          setState({ data: null, loading: false, error });
        }
      });
  }, []);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, retry: run };
}

/**
 * useAsyncFn — returns a manual trigger function alongside state.
 * Use for mutations (POST/PATCH/DELETE).
 */
export function useAsyncFn<T, A extends unknown[]>(
  fn: (...args: A) => Promise<T>,
) {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: Error | null;
  }>({ data: null, loading: false, error: null });

  const execute = useCallback(
    async (...args: A): Promise<T> => {
      setState({ data: null, loading: true, error: null });
      try {
        const data = await fn(...args);
        setState({ data, loading: false, error: null });
        return data;
      } catch (error) {
        setState({ data: null, loading: false, error: error as Error });
        throw error;
      }
    },
    [fn],
  );

  return { ...state, execute };
}
