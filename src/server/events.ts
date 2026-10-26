/** SSE 事件总线：发布/订阅，向所有活跃 SSE 连接广播事件。 */

export type SseEvent = string;
export type SsePayload = string;

type Listener = (event: SseEvent, payload: SsePayload) => void;

const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 发布事件。data 会被 JSON 序列化为字符串。 */
export function emit(event: SseEvent, data: unknown): void {
  const payload = JSON.stringify(data);
  for (const fn of listeners) {
    try {
      fn(event, payload);
    } catch {
      /* 单个 listener 异常不应影响其他订阅者 */
    }
  }
}
