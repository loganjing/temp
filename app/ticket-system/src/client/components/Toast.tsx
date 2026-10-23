import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type ToastType = 'success' | 'error'
interface ToastState { message: string; type: ToastType; id: number }

const ToastContext = createContext<(message: string, type?: ToastType) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastState[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { message, type, id }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
  }, [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {toasts.map((t) => (
          <div key={t.id} className="card" style={{
            minWidth: '240px', maxWidth: '360px', padding: '0.75rem 1rem',
            borderLeft: `3px solid ${t.type === 'error' ? 'var(--danger)' : 'var(--success)'}`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}>
            <p style={{ margin: 0, color: t.type === 'error' ? 'var(--danger)' : 'var(--success)', fontSize: '0.9rem' }}>
              {t.message}
            </p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
