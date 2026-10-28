import React, { useEffect } from 'react'

/**
 * 删除确认对话框组件
 */
export default function ConfirmDialog({ title, message, onConfirm, onCancel }) {
  // Escape 键关闭对话框
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{title}</h2>
        <p className="confirm-message">{message}</p>
        <div className="form-actions">
          <button className="btn btn-default" onClick={onCancel}>
            取消
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            确认删除
          </button>
        </div>
      </div>
    </div>
  )
}
