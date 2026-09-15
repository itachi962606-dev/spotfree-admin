export default function ConfirmDialog({ title, message, onConfirm, onCancel, confirmLabel = "Delete" }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card small" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
