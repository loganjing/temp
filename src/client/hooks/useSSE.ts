/**
 * SSE Hook — 全局连接 + 事件订阅
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { sseManager } from '../sse';
import type { SSEConnectionStatus, SSEEventType, SSEEventData } from '../types';

/** SSE 连接状态 */
export function useSSEConnection(): SSEConnectionStatus {
  const [status, setStatus] = useState<SSEConnectionStatus>('connecting');

  useEffect(() => {
    sseManager.connect();
    const unsub = sseManager.onStatusChange(setStatus);
    return () => {
      unsub();
      sseManager.close();
    };
  }, []);

  return status;
}

/** 订阅单个 SSE 事件类型 */
export function useSSEEvent<K extends SSEEventType>(
  type: K,
  handler: (data: SSEEventData[K]) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsub = sseManager.on(type, (data) => {
      handlerRef.current(data);
    });
    return unsub;
  }, [type]);
}

/** 订阅多个 SSE 事件类型，统一触发回调（用于刷新数据） */
export function useSSERefresh(types: SSEEventType[], onEvent: () => void): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const typesKey = types.join(',');

  useEffect(() => {
    const unsubs = types.map((type) =>
      sseManager.on(type, () => {
        onEventRef.current();
      }),
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typesKey]);
}

/** 手动触发刷新的回调包装 */
export function useRefreshCallback(): { refreshKey: number; refresh: () => void } {
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);
  return { refreshKey, refresh };
}
