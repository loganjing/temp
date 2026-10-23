import Modal from './Modal.jsx';

export default function ConfirmDialog({ title, message, onConfirm, onClose }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-danger" onClick={onConfirm}>确认删除</button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}
