import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface ToastMessage {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

export type ToastPush = (kind: ToastMessage['kind'], text: string) => void;

interface ToastContextValue {
  pushToast: ToastPush;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextToastId = 1;

/** 轻量操作反馈 toast（自动消失）。 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const pushToast = useCallback<ToastPush>((kind, text) => {
    const id = nextToastId++;
    setMessages((prev) => [...prev, { id, kind, text }]);
    window.setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }, 3600);
  }, []);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`toast toast-${m.kind}`}>
            <span className="toast-text">{m.text}</span>
            <button
              type="button"
              className="toast-close"
              aria-label="关闭提示"
              onClick={() => setMessages((prev) => prev.filter((t) => t.id !== m.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx === null) throw new Error('useToast 必须在 ToastProvider 内使用');
  return ctx;
}
