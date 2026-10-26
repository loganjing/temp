/**
 * SSE 连接管理器
 * GET /api/monitor/events — 实时推送状态变更。
 * 支持事件监听注册与断线自动重连（指数退避）。
 */
import type { SSEEventType, SSEEventData, SSEConnectionStatus } from './types';

type AnyHandler = (data: unknown) => void;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export class SSEManager {
  private eventSource: EventSource | null = null;
  private handlers = new Map<SSEEventType, Set<AnyHandler>>();
  private statusHandlers = new Set<(status: SSEConnectionStatus) => void>();
  private reconnectDelay = RECONNECT_BASE_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isManualClose = false;

  connect(): void {
    this.isManualClose = false;
    this.cleanupEventSource();
    this.notifyStatus('connecting');

    const es = new EventSource('/api/monitor/events');
    this.eventSource = es;

    es.onopen = () => {
      this.reconnectDelay = RECONNECT_BASE_MS;
      this.notifyStatus('connected');
    };

    es.onerror = () => {
      this.notifyStatus('disconnected');
      this.cleanupEventSource();
      if (!this.isManualClose) {
        this.scheduleReconnect();
      }
    };

    // 为所有已注册的事件类型添加 EventSource 监听
    this.handlers.forEach((_set, type) => {
      this.attachEventListener(es, type);
    });
  }

  /** 在 EventSource 上注册指定事件类型的监听 */
  private attachEventListener(es: EventSource, type: SSEEventType): void {
    es.addEventListener(type, ((event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        this.dispatch(type, data);
      } catch {
        // 忽略解析失败的事件
      }
    }) as EventListener);
  }

  /** 注册事件监听，返回取消注册函数 */
  on<K extends SSEEventType>(
    type: K,
    handler: (data: SSEEventData[K]) => void,
  ): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set<AnyHandler>();
      this.handlers.set(type, set);
      // 如果 EventSource 已存在，动态添加监听
      if (this.eventSource) {
        this.attachEventListener(this.eventSource, type);
      }
    }
    const wrapped: AnyHandler = (handler as AnyHandler);
    set.add(wrapped);

    return () => {
      set?.delete(wrapped);
    };
  }

  /** 注册连接状态变更监听 */
  onStatusChange(handler: (status: SSEConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  /** 手动关闭（不触发重连） */
  close(): void {
    this.isManualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupEventSource();
    this.notifyStatus('disconnected');
  }

  private dispatch(type: SSEEventType, data: unknown): void {
    const set = this.handlers.get(type);
    set?.forEach((h) => h(data));
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private cleanupEventSource(): void {
    if (this.eventSource) {
      this.eventSource.onopen = null;
      this.eventSource.onerror = null;
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  private notifyStatus(status: SSEConnectionStatus): void {
    this.statusHandlers.forEach((h) => h(status));
  }
}

/** 全局单例 */
export const sseManager = new SSEManager();
