import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  id: number;
  type: ToastType;
  message: string;
  onClose: (id: number) => void;
}

const iconMap = {
  success: <CheckCircle size={20} />,
  error: <XCircle size={20} />,
  warning: <AlertTriangle size={20} />,
  info: <Info size={20} />,
};

export function Toast({ id, type, message, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(id), 4000);
    return () => clearTimeout(timer);
  }, [id, onClose]);

  return (
    <div className={`toast toast--${type}`} role="alert">
      <span className="toast__icon">{iconMap[type]}</span>
      <span className="toast__message">{message}</span>
      <button className="toast__close" onClick={() => onClose(id)} aria-label="关闭">
        <X size={16} />
      </button>
    </div>
  );
}
