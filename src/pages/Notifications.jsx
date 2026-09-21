import { useEffect, useState } from "react";
import {
  listNotifications,
  createNotification,
  updateNotification,
  deleteNotification,
} from "../services/firestore";
import { uploadImage } from "../services/cloudinary";
import { sendPushNotification } from "../services/fcm";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const emptyForm = {
  title: "",
  message: "",
  type: "general",
  published: true,
  imageUrl: "",
};

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await listNotifications();
      setNotifications(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = notifications.filter(
    (n) =>
      !search ||
      n.title?.toLowerCase().includes(search.toLowerCase()) ||
      n.message?.toLowerCase().includes(search.toLowerCase())
  );

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setImageFile(null);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(notification) {
    setEditingId(notification.id);
    setForm({
      title: notification.title || "",
      message: notification.message || "",
      type: notification.type || "general",
      published: !!notification.published,
      imageUrl: notification.imageUrl || "",
    });
    setImageFile(null);
    setFormError("");
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setFormError("");

    if (!form.title.trim()) {
      setFormError("Notification title is required.");
      return;
    }
    if (!form.message.trim()) {
      setFormError("Notification message is required.");
      return;
    }

    setSaving(true);
    setUploadPct(0);
    try {
      let imageUrl = form.imageUrl;
      if (imageFile) {
        imageUrl = await uploadImage(imageFile, setUploadPct);
      }

      const payload = {
        title: form.title.trim(),
        message: form.message.trim(),
        type: form.type || "general",
        published: Boolean(form.published),
        imageUrl: imageUrl || "",
      };

      let notificationId = editingId;
      if (editingId) {
        await updateNotification(editingId, payload);
      } else {
        notificationId = await createNotification(payload);
      }

      // If published, trigger FCM delivery
      if (payload.published) {
        sendPushNotification({ ...payload, id: notificationId });
      }

      setShowForm(false);
      refresh();
    } catch (err) {
      setFormError(err.message || "Failed to save notification.");
    } finally {
      setSaving(false);
      setUploadPct(0);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    try {
      await deleteNotification(deleteTarget.id);
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <p>Loading notifications…</p>;

  return (
    <div>
      <div className="page-header">
        <h1>Notifications</h1>
        <button onClick={openCreate}>+ Create Notification</button>
      </div>
      {error && <p className="error-text">{error}</p>}

      <div className="toolbar">
        <input
          placeholder="Search notifications…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Message</th>
            <th>Date</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((item) => (
            <tr key={item.id}>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt=""
                      style={{ width: "32px", height: "32px", borderRadius: "6px", objectFit: "cover" }}
                    />
                  )}
                  <strong>{item.title}</strong>
                </div>
              </td>
              <td>
                <span className="badge">{item.type || "general"}</span>
              </td>
              <td className="truncate" style={{ maxWidth: "250px" }}>{item.message}</td>
              <td>
                {item.createdAt
                  ? new Date(item.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—"}
              </td>
              <td>
                <span className={item.published ? "badge badge-live" : "badge badge-draft"}>
                  {item.published ? "Published" : "Draft"}
                </span>
              </td>
              <td className="row-actions">
                <button onClick={() => openEdit(item)}>Edit</button>
                <button className="danger" onClick={() => setDeleteTarget(item)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} className="empty-state">
                No notifications found. Create your first announcement!
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSave}>
            <h2>{editingId ? "Edit Notification" : "New Notification"}</h2>

            <label>
              Title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. New Release: Midnight Memories"
                required
              />
            </label>

            <label>
              Type
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="general">General Announcement</option>
                <option value="song">Song Release</option>
                <option value="artist">Artist Update</option>
                <option value="playlist">Playlist Feature</option>
                <option value="update">App Update</option>
              </select>
            </label>

            <label>
              Message
              <textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Write the message that users will see in the app..."
                required
              />
            </label>

            <label>
              Banner / Cover Image (optional)
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              />
              {form.imageUrl && !imageFile && (
                <span className="hint">Current image set. Choose a new file to replace it.</span>
              )}
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => setForm({ ...form, published: e.target.checked })}
              />
              Publish (visible in the Spotfree app immediately)
            </label>

            {saving && uploadPct > 0 && <p className="hint">Uploading image… {uploadPct}%</p>}
            {formError && <p className="error-text">{formError}</p>}

            <div className="modal-actions">
              <button type="button" onClick={() => setShowForm(false)} disabled={saving}>
                Cancel
              </button>
              <button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save Notification"}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete notification?"
          message={`"${deleteTarget.title}" will be permanently removed.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirmed}
        />
      )}
    </div>
  );
}
