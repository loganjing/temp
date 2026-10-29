import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, ButtonHTMLAttributes } from 'react'
import type { SlaPriority, TicketStatus } from '../types'

// === Status & Priority config ===

export const STATUS_LABELS: Record<TicketStatus, string> = {
  created: '已创建',
  pending_assign: '待分配',
  pending_process: '待处理',
  completed: '已完成',
  cancelled: '已取消',
}

export const STATUS_CLASSES: Record<TicketStatus, string> = {
  created: 'bg-gray-100 text-gray-700',
  pending_assign: 'bg-yellow-100 text-yellow-800',
  pending_process: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-500',
}

export const PRIORITY_LABELS: Record<SlaPriority, string> = {
  P0: 'P0 紧急',
  P1: 'P1 高',
  P2: 'P2 中',
  P3: 'P3 低',
  P4: 'P4 最低',
}

export const PRIORITY_CLASSES: Record<SlaPriority, string> = {
  P0: 'bg-red-100 text-red-800',
  P1: 'bg-orange-100 text-orange-800',
  P2: 'bg-yellow-100 text-yellow-800',
  P3: 'bg-blue-100 text-blue-800',
  P4: 'bg-gray-100 text-gray-600',
}

export const PRIORITIES: SlaPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export const STATUSES: TicketStatus[] = ['created', 'pending_assign', 'pending_process', 'completed', 'cancelled']

// === Helpers ===

export function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-CN')
}

// === Badges ===

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASSES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: SlaPriority }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_CLASSES[priority]}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  )
}

// === Skeleton ===

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${100 - i * 15}%` }} />
      ))}
    </div>
  )
}

// === EmptyState ===

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <p className="text-sm">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

// === ErrorBanner ===

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="p-4">
      <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
        <p>{message}</p>
        {onRetry && (
          <button onClick={onRetry} className="mt-2 text-xs font-medium text-red-600 hover:text-red-800 underline">
            重试
          </button>
        )}
      </div>
    </div>
  )
}

// === Modal ===

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

// === Form components ===

export function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
    </label>
  )
}

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} ${props.className ?? ''}`} />
}

// === Buttons ===

export function PrimaryButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed ${props.className ?? ''}`}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center px-3 py-1.5 bg-white text-gray-700 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 ${props.className ?? ''}`}
    >
      {children}
    </button>
  )
}
