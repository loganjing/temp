import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

interface ToastItem { id: number; message: string; variant: 'success' | 'error' }

const ToastContext = createContext<(message: string, variant?: 'success' | 'error') => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback((message: string, variant: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, variant }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }, [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.variant}`}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
