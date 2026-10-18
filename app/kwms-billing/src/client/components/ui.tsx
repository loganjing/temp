import { type ReactNode } from 'react'
import { useEffect } from 'react'

// 通用 UI 基元：弹窗、徽章、提示、空态、骨架、分页、页面头、确认弹窗。
// 视觉遵循 saas-ops-console（Modern SaaS：柔和中性、细边界、少阴影、中等圆角）。

export function Modal({ open, title, onClose, children, footer, width = 560 }: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal" style={{ width: `${width}px` }}>
        <header className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>关闭</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, message, confirmText = '确定', busy, onCancel, onConfirm }: {
  open: boolean
  title: string
  message: string
  confirmText?: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      width={420}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>取消</button>
          <button type="button" className="btn" onClick={onConfirm} disabled={busy}>{busy ? '处理中…' : confirmText}</button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  )
}

export type BadgeTone = 'neutral' | 'success' | 'danger' | 'info' | 'warn'

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  return <span className={`badge badge-${tone}`}>{label}</span>
}

export function statusTone(status: string): BadgeTone {
  if (['effective', 'approved', 'active', 'success'].includes(status)) return 'success'
  if (['terminated', 'failed', 'disabled'].includes(status)) return 'danger'
  if (['reconciled'].includes(status)) return 'info'
  return 'neutral'
}

export function Alert({ kind, children }: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  return <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title" style={{ margin: 0 }}>{title}</p>
      {description && <p className="empty-desc" style={{ margin: 0 }}>{description}</p>}
      {action}
    </div>
  )
}

export function SkeletonRows({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <tbody aria-hidden="true">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <tr key={rowIndex}>
          {Array.from({ length: cols }, (_, colIndex) => (
            <td key={colIndex}><div className="skeleton" style={{ width: colIndex === 0 ? '80%' : '60%' }} /></td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

export function Pagination({ page, pageSize, total, onChange }: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const lastPage = Math.max(Math.ceil(total / pageSize), 1)
  return (
    <div className="pagination">
      <span>共 {total} 条{total > 0 ? `，第 ${from}–${to} 条` : ''}</span>
      <div className="toolbar">
        <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>上一页</button>
        <span>第 {page} / {lastPage} 页</span>
        <button type="button" className="btn btn-secondary btn-sm" disabled={page >= lastPage} onClick={() => onChange(page + 1)}>下一页</button>
      </div>
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {actions && <div className="toolbar">{actions}</div>}
    </div>
  )
}

// 403 / 404 状态页（操作入口按权限渲染，直达路由仍可能越权，需给出中文提示与引导）
export function ForbiddenNotice() {
  return (
    <EmptyState
      title="当前角色无权访问该页面"
      description="如需开通权限，请联系系统管理员在「系统管理 · 用户与角色」中配置。"
      action={<a className="btn btn-secondary btn-sm" href="/">返回工作台</a>}
    />
  )
}

export function NotFoundNotice({ description = '单据不存在或不可见，可能已被删除或不属于当前组织。' }: { description?: string }) {
  return (
    <EmptyState
      title="内容不存在"
      description={description}
      action={<a className="btn btn-secondary btn-sm" href="/">返回工作台</a>}
    />
  )
}
