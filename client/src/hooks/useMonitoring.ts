import { useEffect, useRef, useState, useCallback } from 'react';
import type { WsMessage, WsMessageType } from '@/api/types';

const WS_URL = (() => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/monitoring`;
})();

export interface UseMonitoringOptions {
  types?: WsMessageType[];
  onMessage?: (msg: WsMessage) => void;
  enabled?: boolean;
}

export interface MonitoringState {
  connected: boolean;
  messages: WsMessage[];
  latestTaskStatusChange: WsMessage<'task_status_change'> | null;
  latestDevicePositionUpdate: WsMessage<'device_position_update'> | null;
  latestDeviceStatusChange: WsMessage<'device_status_change'> | null;
  latestTrafficAlert: WsMessage<'traffic_alert'> | null;
  latestExecutionEvent: WsMessage<'execution_event'> | null;
  latestAnomalyAlert: WsMessage<'anomaly_alert'> | null;
  reconnect: () => void;
}

const MAX_MESSAGES = 200;

export function useMonitoring(options: UseMonitoringOptions = {}): MonitoringState {
  const { types, onMessage, enabled = true } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldConnectRef = useRef(enabled);
  shouldConnectRef.current = enabled;

  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [latestTaskStatusChange, setLatestTaskStatusChange] = useState<WsMessage<'task_status_change'> | null>(null);
  const [latestDevicePositionUpdate, setLatestDevicePositionUpdate] = useState<WsMessage<'device_position_update'> | null>(null);
  const [latestDeviceStatusChange, setLatestDeviceStatusChange] = useState<WsMessage<'device_status_change'> | null>(null);
  const [latestTrafficAlert, setLatestTrafficAlert] = useState<WsMessage<'traffic_alert'> | null>(null);
  const [latestExecutionEvent, setLatestExecutionEvent] = useState<WsMessage<'execution_event'> | null>(null);
  const [latestAnomalyAlert, setLatestAnomalyAlert] = useState<WsMessage<'anomaly_alert'> | null>(null);

  // Keep latest onMessage in a ref to avoid reconnect on callback change
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const handleMessage = useCallback((raw: string) => {
    let msg: WsMessage;
    try {
      msg = JSON.parse(raw) as WsMessage;
    } catch {
      return;
    }
    if (!msg.type) return;

    setMessages((prev) => {
      const next = [...prev, msg];
      return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
    });

    switch (msg.type) {
      case 'task_status_change':
        setLatestTaskStatusChange(msg as WsMessage<'task_status_change'>);
        break;
      case 'device_position_update':
        setLatestDevicePositionUpdate(msg as WsMessage<'device_position_update'>);
        break;
      case 'device_status_change':
        setLatestDeviceStatusChange(msg as WsMessage<'device_status_change'>);
        break;
      case 'traffic_alert':
        setLatestTrafficAlert(msg as WsMessage<'traffic_alert'>);
        break;
      case 'execution_event':
        setLatestExecutionEvent(msg as WsMessage<'execution_event'>);
        break;
      case 'anomaly_alert':
        setLatestAnomalyAlert(msg as WsMessage<'anomaly_alert'>);
        break;
    }

    onMessageRef.current?.(msg);
  }, []);

  const connect = useCallback(() => {
    if (!shouldConnectRef.current) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Send subscribe if types specified
      if (types && types.length > 0) {
        ws.send(JSON.stringify({ type: 'subscribe', payload: { types } }));
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after error
    };

    ws.onmessage = (ev) => {
      if (ev.data === 'pong') return;
      handleMessage(ev.data as string);
    };
  }, [types, handleMessage]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connect();
    }, 5000);
  }, [connect]);

  // Also send periodic ping
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [connected]);

  useEffect(() => {
    connect();
    return () => {
      shouldConnectRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect]);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    connect();
  }, [connect]);

  return {
    connected,
    messages,
    latestTaskStatusChange,
    latestDevicePositionUpdate,
    latestDeviceStatusChange,
    latestTrafficAlert,
    latestExecutionEvent,
    latestAnomalyAlert,
    reconnect,
  };
}
