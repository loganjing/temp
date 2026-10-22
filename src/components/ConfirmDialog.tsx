interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 应用内确认提示，避免浏览器原生弹窗阻塞操作流程。 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="modal-layer">
      <div className="modal-backdrop" onClick={onCancel} />
      <div
        className="modal-panel modal-panel-compact"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <header className="modal-header">
          <h2 id="confirm-dialog-title">{title}</h2>
        </header>
        <p className="confirm-message" id="confirm-dialog-message">
          {message}
        </p>
        <footer className="modal-actions">
          <button type="button" className="button-secondary" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="button-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}