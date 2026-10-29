/**
 * 删除确认对话框
 * 删除教师前弹出，用户确认后才执行删除（推荐基线：防止误删）。
 *
 * @param {Object} props
 * @param {Object} props.teacher - 待删除的教师记录
 * @param {Function} props.onConfirm - 确认删除回调
 * @param {Function} props.onCancel - 取消回调
 */
export default function DeleteConfirm({ teacher, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">确认删除</div>
        <div className="modal-body">
          <p className="confirm-text">
            确定要删除教师「{teacher?.name}」吗？
          </p>
          <p className="confirm-subtext">此操作不可撤销。</p>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              取消
            </button>
            <button type="button" className="btn btn-primary" onClick={onConfirm}>
              确认删除
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
